import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentProducerChat } from "./ContentProducerChat";

const mockChat = vi.fn();
const mockGetSession = vi.fn().mockResolvedValue({ messages: [] });
const mockClearSession = vi.fn().mockResolvedValue({ ok: true });
const mockStartGen = vi.fn();
const mockGetLatest = vi.fn().mockResolvedValue({ snapshot: null });
const mockRetry = vi.fn();
const mockCancel = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue({ close: vi.fn() });

vi.mock("@/lib/api", () => ({
  chatWithProducer: (...args: unknown[]) => mockChat(...args),
  getProducerSession: (...args: unknown[]) => mockGetSession(...args),
  clearProducerSession: (...args: unknown[]) => mockClearSession(...args),
  startGeneration: (...args: unknown[]) => mockStartGen(...args),
  getLatestJob: (...args: unknown[]) => mockGetLatest(...args),
  retryLesson: (...args: unknown[]) => mockRetry(...args),
  cancelJob: (...args: unknown[]) => mockCancel(...args),
}));

vi.mock("@/lib/sse", () => ({
  subscribeJobEvents: (...args: unknown[]) => mockSubscribe(...args),
}));

vi.mock("@/lib/session", () => ({
  getOrCreateSessionId: () => "test-session",
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ messages: [] });
  mockGetLatest.mockResolvedValue({ snapshot: null });
});

describe("ContentProducerChat", () => {
  it("renders the welcome view by default", async () => {
    render(<ContentProducerChat />);
    await waitFor(() => {
      expect(screen.getByText("Crie suas lições")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /gerar lições genéricas/i })
    ).toBeInTheDocument();
  });

  it("sends the quick-start message and transitions to chat view", async () => {
    mockChat.mockResolvedValueOnce({
      reply: "Quantas lições por nível você quer?",
    });
    const user = userEvent.setup();
    render(<ContentProducerChat />);
    await waitFor(() => screen.getByText("Crie suas lições"));

    await user.click(screen.getByRole("button", { name: /gerar lições genéricas/i }));

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith("test-session", "Gere lições genéricas para mim");
    });
    await waitFor(() => {
      expect(screen.getByText("Gere lições genéricas para mim")).toBeInTheDocument();
    });
  });

  it("shows the plan card when the API returns ready=true", async () => {
    mockChat.mockResolvedValueOnce({
      reply: "Plano pronto!",
      plan: {
        lessons: [{ level: "beginner", theme: "Coffee", count: 3 }],
        characters: { app: "Aimee", student: "Todd" },
        estimatedMinutes: 5,
      },
    });
    const user = userEvent.setup();
    render(<ContentProducerChat />);
    await waitFor(() => screen.getByText("Crie suas lições"));
    await user.click(screen.getByRole("button", { name: /gerar lições genéricas/i }));

    await waitFor(() => {
      expect(screen.getByText("Plano de Geração / Generation Plan")).toBeInTheDocument();
    });
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("Aimee & Todd")).toBeInTheDocument();
  });

  it("confirms the plan and starts generation", async () => {
    mockChat.mockResolvedValueOnce({
      reply: "Plano pronto!",
      plan: {
        lessons: [{ level: "beginner", theme: "Coffee", count: 2 }],
        characters: { app: "Aimee", student: "Todd" },
        estimatedMinutes: 5,
      },
    });
    mockStartGen.mockResolvedValueOnce({
      job_id: "job-1",
      snapshot: {
        id: "job-1",
        sessionId: "test-session",
        plan: {
          lessons: [{ level: "beginner", theme: "Coffee", count: 2 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 5,
        },
        status: "running",
        progress: {
          total: 2,
          completed: 0,
          failed: 0,
          inProgress: 0,
          lessons: [
            { level: "beginner", theme: "Coffee", status: "pending" },
            { level: "beginner", theme: "Coffee", status: "pending" },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const user = userEvent.setup();
    render(<ContentProducerChat />);
    await waitFor(() => screen.getByText("Crie suas lições"));
    await user.click(screen.getByRole("button", { name: /gerar lições genéricas/i }));
    await waitFor(() => screen.getByText("Plano de Geração / Generation Plan"));
    await user.click(screen.getByRole("button", { name: /confirmar e gerar/i }));

    await waitFor(() => {
      expect(mockStartGen).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText(/Gerando Lições/i)).toBeInTheDocument();
    });
    expect(mockSubscribe).toHaveBeenCalledWith("job-1", expect.anything());
  });

  it("shows progress rows with the right status icon", async () => {
    mockGetSession.mockResolvedValue({ messages: [] });
    mockGetLatest.mockResolvedValue({
      snapshot: {
        id: "job-1",
        sessionId: "test-session",
        plan: {
          lessons: [{ level: "beginner", theme: "Coffee", count: 3 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 5,
        },
        status: "running",
        progress: {
          total: 3,
          completed: 1,
          failed: 1,
          inProgress: 1,
          lessons: [
            { level: "beginner", theme: "Coffee", status: "completed", title: "First" },
            { level: "beginner", theme: "Coffee", status: "generating" },
            { level: "beginner", theme: "Coffee", status: "failed", error: "OpenAI timeout" },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<ContentProducerChat />);
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });
    expect(screen.getByTestId("lesson-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("lesson-row-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it("retries a failed lesson when the retry chip is clicked", async () => {
    mockGetLatest.mockResolvedValue({
      snapshot: {
        id: "job-1",
        sessionId: "test-session",
        plan: {
          lessons: [{ level: "beginner", theme: "Coffee", count: 1 }],
          characters: { app: "Aimee", student: "Todd" },
          estimatedMinutes: 5,
        },
        status: "running",
        progress: {
          total: 1,
          completed: 0,
          failed: 1,
          inProgress: 0,
          lessons: [
            { level: "beginner", theme: "Coffee", status: "failed", error: "err" },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    mockRetry.mockResolvedValueOnce({
      id: "job-1",
      sessionId: "test-session",
      plan: {
        lessons: [{ level: "beginner", theme: "Coffee", count: 1 }],
        characters: { app: "Aimee", student: "Todd" },
        estimatedMinutes: 5,
      },
      status: "running",
      progress: {
        total: 1,
        completed: 0,
        failed: 1,
        inProgress: 0,
        lessons: [
          { level: "beginner", theme: "Coffee", status: "generating" },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    render(<ContentProducerChat />);
    await waitFor(() => screen.getByRole("button", { name: /tentar novamente/i }));
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    await waitFor(() => {
      expect(mockRetry).toHaveBeenCalledWith("job-1", 0);
    });
  });
});
