// Server-side fetches go directly to the API service inside the Docker
// network (or localhost during `next dev`). Client-side fetches use a
// relative URL so they go through the same origin as the page — Next.js
// proxies `/api/*` to the API service (see web/next.config.ts). Single-
// origin keeps HTTPS + LAN access working without mixed-content blocks.
const API_URL =
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL ?? "http://localhost:3001"
    : "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export interface PlanLesson {
  level: "beginner" | "intermediate" | "advanced";
  theme: string;
  count: number;
}

export interface GenerationPlan {
  lessons: PlanLesson[];
  characters: { app: string; student: string };
  estimatedMinutes: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  plan?: GenerationPlan;
  guardrail?: { triggered: true; suggestedTopic?: string };
}

export interface ChatResponse {
  reply: string;
  plan?: GenerationPlan;
  guardrail?: ChatMessage["guardrail"];
}

export type LessonStatus = "pending" | "generating" | "completed" | "failed";

export interface LessonProgress {
  level: "beginner" | "intermediate" | "advanced";
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
  plan: GenerationPlan;
  status: JobStatus;
  progress: JobProgress;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function chatWithProducer(
  sessionId: string,
  message: string
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/content-producer/chat", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export function getProducerSession(sessionId: string): Promise<{ messages: ChatMessage[] }> {
  return apiFetch<{ messages: ChatMessage[] }>(
    `/api/content-producer/session/${encodeURIComponent(sessionId)}`
  );
}

export function clearProducerSession(sessionId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(
    `/api/content-producer/session/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
}

export function startGeneration(
  sessionId: string,
  plan: GenerationPlan
): Promise<{ job_id: string; snapshot: JobSnapshot }> {
  return apiFetch<{ job_id: string; snapshot: JobSnapshot }>(
    "/api/content-producer/generate",
    {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, plan }),
    }
  );
}

export function getJobSnapshot(jobId: string): Promise<JobSnapshot> {
  return apiFetch<JobSnapshot>(`/api/content-producer/jobs/${jobId}`);
}

export function getLatestJob(sessionId: string): Promise<{ snapshot: JobSnapshot | null }> {
  return apiFetch<{ snapshot: JobSnapshot | null }>(
    `/api/content-producer/jobs/recent?session_id=${encodeURIComponent(sessionId)}`
  );
}

export function retryLesson(jobId: string, lessonIndex: number): Promise<JobSnapshot> {
  return apiFetch<JobSnapshot>(`/api/content-producer/jobs/${jobId}/retry`, {
    method: "POST",
    body: JSON.stringify({ lesson_index: lessonIndex }),
  });
}

export function cancelJob(jobId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/content-producer/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}
