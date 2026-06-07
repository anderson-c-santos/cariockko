import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";
import {
  createSemaphore,
  generateAndPersistLesson,
  pickTheme,
  LESSON_THEMES,
  type Level,
} from "../agents/lesson-generator.js";

const GEN_CONCURRENCY = parseInt(process.env.GEN_CONCURRENCY ?? "3", 10);

export const PlanInputSchema = z.object({
  lessons: z
    .array(
      z.object({
        level: z.enum(["beginner", "intermediate", "advanced"]),
        theme: z.string().min(1).max(120),
        count: z.number().int().min(1).max(20),
      })
    )
    .min(1)
    .max(20),
  characters: z
    .object({
      app: z.string().min(1),
      student: z.string().min(1),
    })
    .default({ app: "Aimee", student: "Todd" }),
  estimatedMinutes: z.number().int().min(1).max(60).default(5),
});

export type PlanInput = z.infer<typeof PlanInputSchema>;

export type LessonStatus = "pending" | "generating" | "completed" | "failed";

export interface LessonProgress {
  level: Level;
  theme: string;
  status: LessonStatus;
  title?: string;
  error?: string;
  lessonId?: string;
}

export interface JobProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  lessons: LessonProgress[];
}

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface JobSnapshot {
  id: string;
  sessionId: string;
  plan: PlanInput;
  status: JobStatus;
  progress: JobProgress;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface InternalJob {
  snapshot: JobSnapshot;
  cancelToken: { cancelled: boolean };
  subscribers: Set<(snapshot: JobSnapshot) => void>;
}

const jobs = new Map<string, InternalJob>();

function emptyProgressFor(plan: PlanInput): JobProgress {
  const lessons: LessonProgress[] = [];
  for (const entry of plan.lessons) {
    for (let i = 0; i < entry.count; i += 1) {
      const theme = pickUniqueTheme(plan, entry.level, i);
      lessons.push({ level: entry.level, theme, status: "pending" });
    }
  }
  return {
    total: lessons.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
    lessons,
  };
}

function pickUniqueTheme(plan: PlanInput, level: Level, index: number): string {
  const themes = LESSON_THEMES[level] ?? [];
  if (themes.length === 0) return "General conversation";
  return themes[index % themes.length] ?? themes[0] ?? "General conversation";
}

async function persistJob(snapshot: JobSnapshot): Promise<void> {
  await pool.query(
    `INSERT INTO lesson_generation_jobs
       (id, session_id, plan, status, progress, error, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       progress = EXCLUDED.progress,
       error = EXCLUDED.error,
       updated_at = EXCLUDED.updated_at`,
    [
      snapshot.id,
      snapshot.sessionId,
      JSON.stringify(snapshot.plan),
      snapshot.status,
      JSON.stringify(snapshot.progress),
      snapshot.error ?? null,
      snapshot.createdAt,
      snapshot.updatedAt,
    ]
  );
}

function notify(job: InternalJob): void {
  for (const sub of job.subscribers) {
    try {
      sub(job.snapshot);
    } catch {
      // Swallow subscriber errors so one bad consumer doesn't break the job.
    }
  }
}

function updateProgress(
  job: InternalJob,
  lessonIndex: number,
  patch: Partial<LessonProgress>
): void {
  const lesson = job.snapshot.progress.lessons[lessonIndex];
  if (!lesson) return;
  Object.assign(lesson, patch);

  job.snapshot.progress.completed = job.snapshot.progress.lessons.filter(
    (l) => l.status === "completed"
  ).length;
  job.snapshot.progress.failed = job.snapshot.progress.lessons.filter(
    (l) => l.status === "failed"
  ).length;
  job.snapshot.progress.inProgress = job.snapshot.progress.lessons.filter(
    (l) => l.status === "generating"
  ).length;

  job.snapshot.updatedAt = new Date().toISOString();
}

export async function enqueueJob(
  sessionId: string,
  planInput: PlanInput
): Promise<JobSnapshot> {
  const plan = PlanInputSchema.parse(planInput);
  const id = randomUUID();
  const now = new Date().toISOString();
  const snapshot: JobSnapshot = {
    id,
    sessionId,
    plan,
    status: "running",
    progress: emptyProgressFor(plan),
    createdAt: now,
    updatedAt: now,
  };

  const internal: InternalJob = {
    snapshot,
    cancelToken: { cancelled: false },
    subscribers: new Set(),
  };
  jobs.set(id, internal);
  await persistJob(snapshot);
  notify(internal);

  void runJob(internal).catch((err) => {
    console.error(`[queue] Job ${id} crashed:`, err);
    internal.snapshot.status = "failed";
    internal.snapshot.error =
      err instanceof Error ? err.message : "Unknown queue error";
    internal.snapshot.updatedAt = new Date().toISOString();
    void persistJob(internal.snapshot);
    notify(internal);
  });

  return snapshot;
}

async function runJob(job: InternalJob): Promise<void> {
  const acquire = createSemaphore(GEN_CONCURRENCY);
  const indices = job.snapshot.progress.lessons.map((_, i) => i);

  await Promise.allSettled(
    indices.map((lessonIndex) =>
      acquire(async () => {
        if (job.cancelToken.cancelled) {
          updateProgress(job, lessonIndex, { status: "failed", error: "Cancelled" });
          await persistJob(job.snapshot);
          notify(job);
          return;
        }

        const lesson = job.snapshot.progress.lessons[lessonIndex];
        if (!lesson) return;
        const themeIndex = (LESSON_THEMES[lesson.level] ?? []).indexOf(lesson.theme);
        const safeIndex = themeIndex >= 0 ? themeIndex : 0;

        updateProgress(job, lessonIndex, { status: "generating" });
        await persistJob(job.snapshot);
        notify(job);

        try {
          const result = await generateAndPersistLesson({
            level: lesson.level,
            themeIndex: safeIndex,
          });
          updateProgress(job, lessonIndex, {
            status: "completed",
            title: result.title,
            lessonId: result.lessonId,
          });
        } catch (err) {
          updateProgress(job, lessonIndex, {
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
        await persistJob(job.snapshot);
        notify(job);
      })
    )
  );

  // If cancelled mid-flight, surface that as the overall status.
  if (job.cancelToken.cancelled) {
    job.snapshot.status = "cancelled";
  } else if (job.snapshot.progress.failed === job.snapshot.progress.total) {
    job.snapshot.status = "failed";
    job.snapshot.error = "All lessons failed";
  } else {
    job.snapshot.status = "completed";
  }
  job.snapshot.updatedAt = new Date().toISOString();
  await persistJob(job.snapshot);
  notify(job);
}

export async function retryLesson(
  jobId: string,
  lessonIndex: number
): Promise<JobSnapshot | null> {
  const job = jobs.get(jobId);
  if (!job) return null;

  const lesson = job.snapshot.progress.lessons[lessonIndex];
  if (!lesson) return null;
  if (lesson.status !== "failed") return job.snapshot; // no-op for non-failed

  job.snapshot.status = "running";
  job.snapshot.updatedAt = new Date().toISOString();

  const themeIndex = (LESSON_THEMES[lesson.level] ?? []).indexOf(lesson.theme);
  const safeIndex = themeIndex >= 0 ? themeIndex : 0;

  updateProgress(job, lessonIndex, { status: "generating", error: undefined });
  await persistJob(job.snapshot);
  notify(job);

  void (async () => {
    try {
      const result = await generateAndPersistLesson({
        level: lesson.level,
        themeIndex: safeIndex,
      });
      updateProgress(job, lessonIndex, {
        status: "completed",
        title: result.title,
        lessonId: result.lessonId,
        error: undefined,
      });
    } catch (err) {
      updateProgress(job, lessonIndex, {
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    const allCompleted = job.snapshot.progress.lessons.every(
      (l) => l.status === "completed"
    );
    const anyFailed = job.snapshot.progress.lessons.some(
      (l) => l.status === "failed"
    );
    job.snapshot.status = allCompleted
      ? "completed"
      : anyFailed
        ? job.cancelToken.cancelled
          ? "cancelled"
          : "running"
        : "completed";
    job.snapshot.updatedAt = new Date().toISOString();
    await persistJob(job.snapshot);
    notify(job);
  })();

  return job.snapshot;
}

export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.snapshot.status !== "running" && job.snapshot.status !== "pending") {
    return false;
  }
  job.cancelToken.cancelled = true;
  return true;
}

export function subscribe(
  jobId: string,
  listener: (snapshot: JobSnapshot) => void
): () => void {
  const job = jobs.get(jobId);
  if (!job) return () => {};
  job.subscribers.add(listener);
  // Fire the current snapshot immediately so new subscribers can render.
  queueMicrotask(() => listener(job.snapshot));
  return () => {
    job.subscribers.delete(listener);
  };
}

export function getJobSnapshot(jobId: string): JobSnapshot | null {
  return jobs.get(jobId)?.snapshot ?? null;
}

export async function getLatestJobForSession(
  sessionId: string
): Promise<JobSnapshot | null> {
  // If we have a live in-memory job, prefer it.
  for (const job of jobs.values()) {
    if (job.snapshot.sessionId === sessionId) return job.snapshot;
  }

  const { rows } = await pool.query<{
    id: string;
    session_id: string;
    plan: PlanInput;
    status: JobStatus;
    progress: JobProgress;
    error: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, session_id, plan, status, progress, error, created_at, updated_at
     FROM lesson_generation_jobs
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId]
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    plan: row.plan,
    status: row.status,
    progress: row.progress,
    error: row.error ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
