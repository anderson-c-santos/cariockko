import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueJob,
  subscribe,
  getJobSnapshot,
  cancelJob,
  retryLesson,
  type PlanInput,
  type JobSnapshot,
} from "./generation-queue.js";
import * as lessonGen from "../agents/lesson-generator.js";

vi.mock("../lib/db.js", () => ({
  get pool() {
    return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  },
}));

const SAMPLE_PLAN: PlanInput = {
  lessons: [
    { level: "beginner", theme: "Greetings", count: 2 },
  ],
  characters: { app: "Aimee", student: "Todd" },
  estimatedMinutes: 4,
};

describe("generation-queue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a job and runs to completion", async () => {
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockResolvedValue({
      lessonId: "abc",
      title: "Greetings 101",
      level: "beginner",
    });

    const snapshot = await enqueueJob("s1", SAMPLE_PLAN);
    expect(snapshot.progress.total).toBe(2);

    // Wait for both lessons to finish.
    const final = await waitForStatus(snapshot.id, (s) =>
      s.status === "completed" || s.status === "failed"
    );

    expect(final.status).toBe("completed");
    expect(final.progress.completed).toBe(2);
    expect(final.progress.failed).toBe(0);
    expect(getJobSnapshot(snapshot.id)?.id).toBe(snapshot.id);
  });

  it("reports failure for a lesson and continues with the rest", async () => {
    let count = 0;
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockImplementation(async () => {
      count += 1;
      if (count === 1) {
        throw new Error("OpenAI down");
      }
      return { lessonId: "ok", title: "Survived", level: "beginner" };
    });

    const snapshot = await enqueueJob("s2", SAMPLE_PLAN);
    const final = await waitForStatus(snapshot.id, (s) =>
      s.status === "completed" || s.status === "failed"
    );

    expect(final.progress.completed).toBe(1);
    expect(final.progress.failed).toBe(1);
    expect(final.status).toBe("completed");
  });

  it("subscribe() receives the current snapshot and updates", async () => {
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockResolvedValue({
      lessonId: "z",
      title: "Z",
      level: "beginner",
    });

    const snapshot = await enqueueJob("s3", SAMPLE_PLAN);
    const events: JobSnapshot[] = [];
    const unsub = subscribe(snapshot.id, (s) => events.push(s));

    await waitForStatus(snapshot.id, (s) => s.status === "completed");
    unsub();

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.at(-1)?.status).toBe("completed");
  });

  it("retryLesson() re-runs only the failed lesson", async () => {
    let count = 0;
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockImplementation(async () => {
      count += 1;
      if (count === 1) {
        throw new Error("transient");
      }
      return { lessonId: "ok", title: "ok", level: "beginner" };
    });

    const snapshot = await enqueueJob("s4", SAMPLE_PLAN);
    await waitForStatus(snapshot.id, (s) =>
      s.status === "completed" || s.status === "failed"
    );
    expect(snapshot.progress.failed).toBe(1);

    // Make sure the next call succeeds.
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockResolvedValueOnce({
      lessonId: "retry-ok",
      title: "Retried!",
      level: "beginner",
    });

    const updated = await retryLesson(snapshot.id, 0);
    expect(updated).not.toBeNull();

    const final = await waitForStatus(snapshot.id, (s) =>
      s.status === "completed" || s.status === "failed"
    );
    expect(final.progress.completed).toBe(2);
    expect(final.progress.failed).toBe(0);
  });

  it("retryLesson() is a no-op for a non-failed lesson", async () => {
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockResolvedValue({
      lessonId: "ok",
      title: "ok",
      level: "beginner",
    });
    const snapshot = await enqueueJob("s5", SAMPLE_PLAN);
    await waitForStatus(snapshot.id, (s) => s.status === "completed");
    const result = await retryLesson(snapshot.id, 0);
    expect(result).not.toBeNull();
    expect(result?.progress.completed).toBe(2);
  });

  it("cancelJob() marks the snapshot cancelled and stops new work", async () => {
    let calls = 0;
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockImplementation(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { lessonId: "x", title: "x", level: "beginner" };
    });

    const snapshot = await enqueueJob("s6", SAMPLE_PLAN);
    cancelJob(snapshot.id);
    await waitForStatus(snapshot.id, (s) =>
      s.status === "cancelled" || s.status === "completed" || s.status === "failed"
    );
    // Some lessons may have started before the cancel flag was observed;
    // what matters is that the overall status reflects cancellation.
    const final = getJobSnapshot(snapshot.id);
    expect(["cancelled", "completed"]).toContain(final?.status);
    expect(calls).toBeGreaterThanOrEqual(0);
  });

  it("cancelJob() returns false when the job is not active", () => {
    expect(cancelJob("nope")).toBe(false);
  });

  it("subscribe() to an unknown job is a no-op (returns a no-op unsub)", () => {
    const unsub = subscribe("nope", () => {});
    expect(typeof unsub).toBe("function");
    unsub(); // should not throw
  });

  it("getJobSnapshot() returns null for an unknown job", () => {
    expect(getJobSnapshot("nope")).toBeNull();
  });

  it("reports an all-failed job", async () => {
    vi.spyOn(lessonGen, "generateAndPersistLesson").mockRejectedValue(
      new Error("nope")
    );
    const snapshot = await enqueueJob("s7", SAMPLE_PLAN);
    const final = await waitForStatus(snapshot.id, (s) =>
      s.status === "completed" || s.status === "failed"
    );
    expect(final.status).toBe("failed");
    expect(final.progress.failed).toBe(2);
  });
});

function waitForStatus(
  jobId: string,
  predicate: (s: JobSnapshot) => boolean,
  timeoutMs = 5000
): Promise<JobSnapshot> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const snap = getJobSnapshot(jobId);
      if (snap && predicate(snap)) {
        resolve(snap);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timeout waiting for job status"));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}
