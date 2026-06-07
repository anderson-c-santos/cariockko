import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const mockChat = vi.fn();
const mockGetMessages = vi.fn().mockResolvedValue([]);
const mockClearSession = vi.fn().mockResolvedValue(undefined);
const mockEnqueue = vi.fn();
const mockGetSnapshot = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue(() => {});
const mockRetry = vi.fn();
const mockCancel = vi.fn().mockReturnValue(true);
const mockGetLatest = vi.fn().mockResolvedValue(null);

vi.mock("../agents/content-producer-chat.js", () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  getSessionMessages: (...args: unknown[]) => mockGetMessages(...args),
  clearSession: (...args: unknown[]) => mockClearSession(...args),
}));

vi.mock("../lib/generation-queue.js", async () => {
  const { z } = await import("zod");
  return {
    enqueueJob: (...args: unknown[]) => mockEnqueue(...args),
    getJobSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
    retryLesson: (...args: unknown[]) => mockRetry(...args),
    cancelJob: (...args: unknown[]) => mockCancel(...args),
    getLatestJobForSession: (...args: unknown[]) => mockGetLatest(...args),
    PlanInputSchema: z.object({
      lessons: z.array(
        z.object({
          level: z.enum(["beginner", "intermediate", "advanced"]),
          theme: z.string().min(1),
          count: z.number().int().min(1).max(20),
        })
      ),
      characters: z
        .object({ app: z.string(), student: z.string() })
        .default({ app: "Aimee", student: "Todd" }),
      estimatedMinutes: z.number().int().min(1).max(60).default(5),
    }),
  };
});

import { contentProducerRouter } from "./content-producer.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/content-producer", contentProducerRouter);
  return app;
}

describe("content-producer router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /chat", () => {
    it("returns the structured reply on success", async () => {
      mockChat.mockResolvedValueOnce({
        reply: "Confirme o plano abaixo.",
        plan: {
          lessons: [{ level: "beginner", theme: "Coffee", count: 3 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 5,
        },
      });
      const res = await request(makeApp())
        .post("/api/content-producer/chat")
        .send({ session_id: "user-1", message: "Quero 3 lições" });
      expect(res.status).toBe(200);
      expect(res.body.reply).toBe("Confirme o plano abaixo.");
      expect(res.body.plan.lessons[0].theme).toBe("Coffee");
    });

    it("returns 400 for an invalid body", async () => {
      const res = await request(makeApp())
        .post("/api/content-producer/chat")
        .send({ session_id: "user-1" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid session_id", async () => {
      const res = await request(makeApp())
        .post("/api/content-producer/chat")
        .send({ session_id: "bad space", message: "oi" });
      expect(res.status).toBe(400);
    });

    it("returns 500 when the LLM call throws", async () => {
      mockChat.mockRejectedValueOnce(new Error("OpenAI down"));
      const res = await request(makeApp())
        .post("/api/content-producer/chat")
        .send({ session_id: "user-1", message: "oi" });
      expect(res.status).toBe(500);
    });
  });

  describe("GET /session/:id", () => {
    it("returns messages", async () => {
      mockGetMessages.mockResolvedValueOnce([
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá!" },
      ]);
      const res = await request(makeApp()).get(
        "/api/content-producer/session/user-1"
      );
      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
    });

    it("returns 400 for an invalid sessionId", async () => {
      const res = await request(makeApp()).get(
        "/api/content-producer/session/bad%20space"
      );
      expect(res.status).toBe(400);
    });

    it("returns 500 when loading fails", async () => {
      mockGetMessages.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(makeApp()).get(
        "/api/content-producer/session/user-1"
      );
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE /session/:id", () => {
    it("clears the session", async () => {
      const res = await request(makeApp()).delete(
        "/api/content-producer/session/user-1"
      );
      expect(res.status).toBe(200);
      expect(mockClearSession).toHaveBeenCalledWith("user-1");
    });
  });

  describe("POST /generate", () => {
    it("returns 202 with a job_id", async () => {
      mockEnqueue.mockResolvedValueOnce({
        id: "job-123",
        status: "running",
      });
      const res = await request(makeApp())
        .post("/api/content-producer/generate")
        .send({
          session_id: "user-1",
          plan: {
            lessons: [{ level: "beginner", theme: "Coffee", count: 3 }],
            characters: { app: "Aimee", student: "Todd" },
            estimatedMinutes: 5,
          },
        });
      expect(res.status).toBe(202);
      expect(res.body.job_id).toBe("job-123");
    });

    it("rejects plans with more than 60 lessons", async () => {
      const res = await request(makeApp())
        .post("/api/content-producer/generate")
        .send({
          session_id: "user-1",
          plan: {
            lessons: [
              { level: "beginner", theme: "A", count: 20 },
              { level: "intermediate", theme: "B", count: 20 },
              { level: "advanced", theme: "C", count: 21 },
            ],
          },
        });
      expect(res.status).toBe(400);
    });

    it("returns 500 when enqueue throws", async () => {
      mockEnqueue.mockRejectedValueOnce(new Error("DB down"));
      const res = await request(makeApp())
        .post("/api/content-producer/generate")
        .send({
          session_id: "user-1",
          plan: {
            lessons: [{ level: "beginner", theme: "Coffee", count: 3 }],
            characters: { app: "Aimee", student: "Todd" },
            estimatedMinutes: 5,
          },
        });
      expect(res.status).toBe(500);
    });

    it("returns 400 for an invalid body", async () => {
      const res = await request(makeApp())
        .post("/api/content-producer/generate")
        .send({ session_id: "user-1" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /jobs/:id", () => {
    it("returns the snapshot", async () => {
      mockGetSnapshot.mockReturnValueOnce({ id: "job-1", status: "running" });
      const res = await request(makeApp()).get("/api/content-producer/jobs/job-1");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("job-1");
    });

    it("returns 404 when unknown", async () => {
      mockGetSnapshot.mockReturnValueOnce(null);
      const res = await request(makeApp()).get("/api/content-producer/jobs/nope");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /jobs/:id/retry", () => {
    it("returns the updated snapshot", async () => {
      mockRetry.mockResolvedValueOnce({ id: "job-1", status: "running" });
      const res = await request(makeApp())
        .post("/api/content-producer/jobs/job-1/retry")
        .send({ lesson_index: 0 });
      expect(res.status).toBe(200);
    });

    it("returns 404 when the job does not exist", async () => {
      mockRetry.mockResolvedValueOnce(null);
      const res = await request(makeApp())
        .post("/api/content-producer/jobs/nope/retry")
        .send({ lesson_index: 0 });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /jobs/:id/cancel", () => {
    it("returns 200 on success", async () => {
      mockCancel.mockReturnValueOnce(true);
      const res = await request(makeApp()).post(
        "/api/content-producer/jobs/job-1/cancel"
      );
      expect(res.status).toBe(200);
    });

    it("returns 409 when job is not active", async () => {
      mockCancel.mockReturnValueOnce(false);
      const res = await request(makeApp()).post(
        "/api/content-producer/jobs/job-1/cancel"
      );
      expect(res.status).toBe(409);
    });
  });

  describe("GET /jobs/recent", () => {
    it("returns the latest snapshot for a session", async () => {
      mockGetLatest.mockResolvedValueOnce({ id: "job-1", status: "completed" });
      const res = await request(makeApp()).get(
        "/api/content-producer/jobs/recent?session_id=user-1"
      );
      expect(res.status).toBe(200);
      expect(res.body.snapshot.id).toBe("job-1");
    });

    it("returns 400 for an invalid session_id", async () => {
      const res = await request(makeApp()).get(
        "/api/content-producer/jobs/recent?session_id=bad%20space"
      );
      expect(res.status).toBe(400);
    });

    it("returns 500 when the lookup fails", async () => {
      mockGetLatest.mockRejectedValueOnce(new Error("DB down"));
      const res = await request(makeApp()).get(
        "/api/content-producer/jobs/recent?session_id=user-1"
      );
      expect(res.status).toBe(500);
    });
  });

  describe("GET /jobs/:id/events (SSE)", () => {
    it("returns 404 when the job is unknown", async () => {
      mockGetSnapshot.mockReturnValueOnce(null);
      const res = await request(makeApp()).get(
        "/api/content-producer/jobs/unknown/events"
      );
      expect(res.status).toBe(404);
    });

    it("opens an SSE stream and sends at least one event", async () => {
      mockGetSnapshot.mockReturnValue({
        id: "job-1",
        sessionId: "user-1",
        plan: { lessons: [], characters: { app: "Aimee", student: "Todd" }, estimatedMinutes: 1 },
        status: "running",
        progress: { total: 1, completed: 0, failed: 0, inProgress: 1, lessons: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const subCb = vi.fn();
      mockSubscribe.mockImplementationOnce((_id: string, cb: (snapshot: unknown) => void) => {
        // Simulate the queue firing one progress + one done event.
        cb({
          id: "job-1",
          sessionId: "user-1",
          plan: { lessons: [], characters: { app: "Aimee", student: "Todd" }, estimatedMinutes: 1 },
          status: "completed",
          progress: { total: 1, completed: 1, failed: 0, inProgress: 0, lessons: [] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return subCb;
      });
      const res = await request(makeApp()).get(
        "/api/content-producer/jobs/job-1/events"
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
      // The stream should at least have written the initial padding comment.
      expect(res.text).toMatch(/^: open/);
      // A `progress` event was written.
      expect(res.text).toMatch(/event: progress/);
    });
  });
});
