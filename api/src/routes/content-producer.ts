import { Router } from "express";
import { z } from "zod";
import {
  chat as runChat,
  getSessionMessages,
  clearSession,
} from "../agents/content-producer-chat.js";
import {
  enqueueJob,
  subscribe,
  getJobSnapshot,
  retryLesson,
  cancelJob,
  getLatestJobForSession,
  PlanInputSchema,
  type PlanInput,
  type JobSnapshot,
} from "../lib/generation-queue.js";
import { startSseResponse } from "../lib/sse.js";
import { rateLimit } from "../lib/rate-limit.js";

export const contentProducerRouter = Router();

const ChatBodySchema = z.object({
  session_id: z.string().min(1).max(128),
  message: z.string().min(1).max(2000),
});

const GenerateBodySchema = z.object({
  session_id: z.string().min(1).max(128),
  plan: PlanInputSchema,
});

const RetryBodySchema = z.object({
  lesson_index: z.number().int().min(0).max(200),
});

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function isValidSessionId(value: string): boolean {
  return SESSION_ID_RE.test(value);
}

const chatLimiter = rateLimit({
  key: (req) => `chat:${req.body?.session_id ?? ""}`,
  max: 30,
  windowMs: 60_000,
  message: "Limite de mensagens por minuto atingido. Tente novamente em instantes.",
});

const generateLimiter = rateLimit({
  key: (req) => `gen:${req.body?.session_id ?? ""}`,
  max: 5,
  windowMs: 10 * 60_000,
  message: "Limite de gerações por sessão atingido. Tente novamente mais tarde.",
});

contentProducerRouter.post("/chat", chatLimiter, async (req, res) => {
  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  if (!isValidSessionId(parsed.data.session_id)) {
    res.status(400).json({ error: "Invalid session_id" });
    return;
  }

  try {
    const result = await runChat({
      sessionId: parsed.data.session_id,
      message: parsed.data.message,
    });
    res.json({
      reply: result.reply,
      plan: result.plan,
      guardrail: result.guardrail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    console.error("[content-producer/chat] error:", err);
    res.status(500).json({ error: message });
  }
});

contentProducerRouter.get("/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  if (!isValidSessionId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }
  try {
    const messages = await getSessionMessages(sessionId);
    res.json({ session_id: sessionId, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Session load failed";
    res.status(500).json({ error: message });
  }
});

contentProducerRouter.delete("/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  if (!isValidSessionId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }
  try {
    await clearSession(sessionId);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Session clear failed";
    res.status(500).json({ error: message });
  }
});

contentProducerRouter.post("/generate", generateLimiter, async (req, res) => {
  const parsed = GenerateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  if (!isValidSessionId(parsed.data.session_id)) {
    res.status(400).json({ error: "Invalid session_id" });
    return;
  }
  const plan: PlanInput = parsed.data.plan;
  const totalLessons = plan.lessons.reduce((sum, l) => sum + l.count, 0);
  if (totalLessons > 60) {
    res.status(400).json({ error: "Plano muito grande (máx. 60 lições)." });
    return;
  }

  try {
    const snapshot = await enqueueJob(parsed.data.session_id, plan);
    res.status(202).json({ job_id: snapshot.id, snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("[content-producer/generate] error:", err);
    res.status(500).json({ error: message });
  }
});

contentProducerRouter.get("/jobs/recent", async (req, res) => {
  const sessionId = String(req.query.session_id ?? "");
  if (!isValidSessionId(sessionId)) {
    res.status(400).json({ error: "Invalid session_id" });
    return;
  }
  try {
    const snap = await getLatestJobForSession(sessionId);
    res.json({ snapshot: snap });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job lookup failed";
    res.status(500).json({ error: message });
  }
});

contentProducerRouter.get("/jobs/:jobId", (req, res) => {
  const { jobId } = req.params;
  const snap = getJobSnapshot(jobId);
  if (!snap) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(snap);
});

contentProducerRouter.get("/jobs/:jobId/events", (req, res) => {
  const { jobId } = req.params;
  const existing = getJobSnapshot(jobId);
  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const sse = startSseResponse(res);

  const send = (snap: JobSnapshot) => {
    sse.send("progress", snap);
    if (snap.status === "completed" || snap.status === "failed" || snap.status === "cancelled") {
      sse.send("done", { status: snap.status });
      // Give the client a moment to flush before closing.
      setTimeout(() => sse.close(), 250);
    }
  };

  const unsub = subscribe(jobId, send);

  req.on("close", () => {
    unsub();
    sse.close();
  });
});

contentProducerRouter.post("/jobs/:jobId/retry", async (req, res) => {
  const { jobId } = req.params;
  const parsed = RetryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  const updated = await retryLesson(jobId, parsed.data.lesson_index);
  if (!updated) {
    res.status(404).json({ error: "Job or lesson not found" });
    return;
  }
  res.json(updated);
});

contentProducerRouter.post("/jobs/:jobId/cancel", (req, res) => {
  const { jobId } = req.params;
  const ok = cancelJob(jobId);
  if (!ok) {
    res.status(409).json({ error: "Job is not active" });
    return;
  }
  res.json({ ok: true });
});
