import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  chat,
  clearSession,
  detectGuardrailHeuristic,
  PlanSchema,
  getSessionMessages,
  type ChatTurnResult,
} from "./content-producer-chat.js";

const mockPool = {
  query: vi.fn(),
};

vi.mock("../lib/db.js", () => ({
  get pool() {
    return mockPool;
  },
}));

function fakeLlm(reply: unknown) {
  return {
    invoke: vi.fn().mockResolvedValue(reply),
    withStructuredOutput: vi.fn().mockReturnThis(),
  };
}

describe("content-producer-chat", () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  describe("detectGuardrailHeuristic", () => {
    it.each([
      "explique a gramática",
      "o que é past perfect?",
      "como se diz 'bom dia' em inglês?",
      "escreva um poema",
      "conte uma piada",
    ])("flags %s", (msg) => {
      expect(detectGuardrailHeuristic(msg)).toBe(true);
    });

    it.each([
      "Crie 5 lições de iniciante sobre comida",
      "Quero praticar vocabulário de viagem",
      "Gere aulas intermediárias para mim",
    ])("does not flag %s", (msg) => {
      expect(detectGuardrailHeuristic(msg)).toBe(false);
    });
  });

  describe("PlanSchema", () => {
    it("rejects invalid plan output", () => {
      const result = PlanSchema.safeParse({
        ready: true,
        plan: { lessons: [{ level: "wizard", theme: "x", count: 1 }] },
      });
      expect(result.success).toBe(false);
    });

    it("accepts a minimal valid plan", () => {
      const result = PlanSchema.safeParse({
        ready: true,
        reply: "",
        plan: {
          lessons: [{ level: "beginner", theme: "Greetings", count: 3 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 5,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("chat()", () => {
    it("persists messages and returns the structured reply", async () => {
      // First call loads the session, second call saves it.
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const llm = fakeLlm({
        ready: true,
        reply: "Pronto! Confirme o plano abaixo.",
        plan: {
          lessons: [{ level: "beginner", theme: "Ordering coffee", count: 3 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 4,
        },
      });

      const result = await chat({
        sessionId: "test-session",
        message: "Quero 3 lições iniciantes sobre café",
        llmFactory: () => llm as never,
      });

      expect(result.plan?.lessons[0]?.theme).toBe("Ordering coffee");
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it("synthesizes a reply when the model returns an empty plan reply", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const llm = fakeLlm({
        ready: true,
        reply: "",
        plan: {
          lessons: [{ level: "beginner", theme: "Ordering coffee", count: 3 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 4,
        },
      });

      const result = await chat({
        sessionId: "test-session",
        message: "Quero 3 lições iniciantes sobre café",
        llmFactory: () => llm as never,
      });

      expect(result.reply).toContain("Montei um plano com 3 lições");
      expect(result.reply).toContain("Ordering coffee");
    });

    it("applies the guardrail when the model says so", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const llm = fakeLlm({
        ready: false,
        reply:
          "Eu estou aqui para te ajudar a criar novas lições. Para gramática, o ideal é praticar.",
        guardrail: { triggered: true, suggestedTopic: "verb tenses" },
      });

      const result = await chat({
        sessionId: "test-session",
        message: "explique o past perfect",
        llmFactory: () => llm as never,
      });

      expect(result.guardrail?.triggered).toBe(true);
      expect(result.plan).toBeUndefined();
    });

    it("forces a guardrail via heuristic when the model misses it", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const llm = fakeLlm({
        ready: false,
        reply: "Hmm, the past perfect is used for actions completed before another past action.",
      });

      const result = await chat({
        sessionId: "test-session",
        message: "explique a gramática do past perfect",
        llmFactory: () => llm as never,
      });

      expect(result.guardrail?.triggered).toBe(true);
    });

    it("appends to existing history and saves the new turn", async () => {
      const existingHistory = [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá! Como posso ajudar?", plan: undefined, guardrail: undefined },
      ];
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ session_id: "s1", messages: existingHistory }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const llm = fakeLlm({
        ready: true,
        reply: "Aqui está o plano!",
        plan: {
          lessons: [{ level: "intermediate", theme: "Travel", count: 5 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 8,
        },
      });

      await chat({
        sessionId: "s1",
        message: "Quero 5 lições intermediárias sobre viagem",
        llmFactory: () => llm as never,
      });

      // The save call (2nd) should include the new user message and the assistant reply.
      const saveCall = mockPool.query.mock.calls[1];
      expect(saveCall[0]).toMatch(/INSERT INTO content_producer_sessions/);
      const messagesArg = JSON.parse(saveCall[1][1]);
      expect(messagesArg).toHaveLength(4);
      expect(messagesArg[2]).toEqual({ role: "user", content: "Quero 5 lições intermediárias sobre viagem" });
      expect(messagesArg[3].role).toBe("assistant");
    });
  });

  describe("getSessionMessages / clearSession", () => {
    it("returns empty array when no session exists", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await getSessionMessages("nope");
      expect(result).toEqual([]);
    });

    it("clears the session row", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await clearSession("s1");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM content_producer_sessions"),
        ["s1"]
      );
    });
  });
});
