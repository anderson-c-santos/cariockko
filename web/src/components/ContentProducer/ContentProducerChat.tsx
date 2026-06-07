"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader } from "lucide-react";
import {
  chatWithProducer,
  clearProducerSession,
  getLatestJob,
  getProducerSession,
  retryLesson,
  startGeneration,
  cancelJob,
  type ChatMessage,
  type JobSnapshot,
} from "@/lib/api";
import { subscribeJobEvents } from "@/lib/sse";
import { getOrCreateSessionId, clearSessionId } from "@/lib/session";
import { WelcomeView } from "./WelcomeView";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { PlanCard } from "./PlanCard";
import { GenerationProgressCard } from "./GenerationProgressCard";
import { DoneFooter } from "./DoneFooter";

type View = "welcome" | "chatting" | "planReview" | "generating" | "done";

type FlowMode = "quick" | "guided";

interface PendingPlan {
  plan: import("@/lib/api").GenerationPlan;
  messageIndex: number;
}

function buildQuickStartMessage(preferredLevel?: string): string {
  return preferredLevel
    ? `Quero um conjunto de lições no nível ${preferredLevel} com um único tema central bem coerente e útil do dia a dia. Sugira temas concretos e diferentes entre si dentro desse mesmo contexto, e monte um plano pronto, sem pedir detalhes extras.`
    : "Quero um conjunto de lições com um único tema central bem coerente e útil do dia a dia. Sugira temas concretos e diferentes entre si dentro desse mesmo contexto, e monte um plano pronto, sem pedir detalhes extras.";
}

function buildGuidedStartMessage(preferredLevel?: string): string {
  return preferredLevel
    ? `Quero criar minhas primeiras lições no nível ${preferredLevel}. Me faça perguntas curtas sobre meus objetivos, interesses e rotina e sugira um único tema principal com variações coerentes para eu escolher.`
    : "Quero criar minhas primeiras lições. Me faça perguntas curtas sobre meus objetivos, interesses e rotina e sugira um único tema principal com variações coerentes para eu escolher.";
}

export function ContentProducerChat({
  initialMode = "quick",
  preferredLevel,
}: {
  initialMode?: FlowMode;
  preferredLevel?: string;
}) {
  const [view, setView] = useState<View>("welcome");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [restored, setRestored] = useState(false);
  const sessionIdRef = useRef<string>("");
  const sseRef = useRef<{ close: () => void } | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sessionIdRef.current = getOrCreateSessionId();
    void restoreSession();
    return () => {
      sseRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, view]);

  const restoreSession = useCallback(async () => {
    try {
      const [{ messages: persisted }, { snapshot: latest }] = await Promise.all([
        getProducerSession(sessionIdRef.current),
        getLatestJob(sessionIdRef.current).catch(() => ({ snapshot: null })),
      ]);
      setMessages(persisted);
      if (latest) {
        setJob(latest);
        if (latest.status === "running") {
          setView("generating");
          attachToJob(latest.id);
        } else {
          setView("done");
        }
      } else if (persisted.length > 0) {
        setView("chatting");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao restaurar sessão.";
      setError(message);
    } finally {
      setRestored(true);
    }
  }, []);

  const attachToJob = useCallback((jobId: string) => {
    sseRef.current?.close();
    sseRef.current = subscribeJobEvents(jobId, {
      onProgress: (snapshot) => {
        setJob(snapshot);
        if (
          snapshot.status === "completed" ||
          snapshot.status === "failed" ||
          snapshot.status === "cancelled"
        ) {
          setView("done");
        }
      },
      onDone: (status) => {
        setView("done");
        setJob((prev) => (prev ? { ...prev, status } : prev));
      },
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;
      setError(null);
      setSending(true);
      setView("chatting");
      const userMessage: ChatMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      setDraft("");

      try {
        const response = await chatWithProducer(sessionIdRef.current, text);
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: response.reply,
          plan: response.plan,
          guardrail: response.guardrail,
        };
        let assistantIndex = 0;
        setMessages((prev) => {
          assistantIndex = prev.length;
          return [...prev, assistantMessage];
        });

        if (response.plan && !response.guardrail) {
          setPendingPlan({ plan: response.plan, messageIndex: assistantIndex });
          setView("planReview");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha ao enviar mensagem.";
        setError(message);
        // Roll back the optimistic user message on error.
        setMessages((prev) => prev.filter((m) => m !== userMessage));
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  const confirmPlan = useCallback(async () => {
    if (!pendingPlan) return;
    setError(null);
    try {
      const { snapshot } = await startGeneration(sessionIdRef.current, pendingPlan.plan);
      setJob(snapshot);
      setView("generating");
      attachToJob(snapshot.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao iniciar geração.";
      setError(message);
    }
  }, [pendingPlan, attachToJob]);

  const handleRetry = useCallback(
    async (lessonIndex: number) => {
      if (!job) return;
      try {
        const updated = await retryLesson(job.id, lessonIndex);
        setJob(updated);
        attachToJob(updated.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao tentar novamente.");
      }
    },
    [job, attachToJob]
  );

  const handleCancel = useCallback(async () => {
    if (!job) return;
    try {
      await cancelJob(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar.");
    }
  }, [job]);

  const startOver = useCallback(async () => {
    sseRef.current?.close();
    try {
      await clearProducerSession(sessionIdRef.current);
    } catch {
      // ignore — local reset is more important than server sync
    }
    clearSessionId();
    sessionIdRef.current = getOrCreateSessionId();
    setMessages([]);
    setPendingPlan(null);
    setJob(null);
    setError(null);
    setView("welcome");
  }, []);

  if (!restored) {
    return <div className="p-8 text-[#5E5E5E] font-sora">Carregando…</div>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 max-w-3xl w-full mx-auto">
      {error && (
        <div className="mx-4 md:mx-0 mt-4 border border-[#DC2626] bg-[#FEF2F2] p-3 text-sm text-[#DC2626] flex items-start justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fechar erro"
            className="text-[#DC2626] hover:opacity-80"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {view === "welcome" && (
        <WelcomeView
          defaultFlow={initialMode}
          onQuickStart={() => void sendMessage(buildQuickStartMessage(preferredLevel))}
          onGuidedStart={() => void sendMessage(buildGuidedStartMessage(preferredLevel))}
        />
      )}

      {(view === "chatting" || view === "planReview" || view === "generating" || view === "done") && (
        <>
          <header className="px-4 md:px-0 py-4 flex items-center justify-between border-b border-[#E5E5E5]">
            <h1 className="font-sora text-lg md:text-xl font-semibold text-black">
              Criar Lições
            </h1>
            <button
              type="button"
              onClick={startOver}
              className="font-mono text-[11px] tracking-[1px] text-[#5E5E5E] hover:text-black"
            >
              NOVA CONVERSA
            </button>
          </header>

          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto px-4 md:px-0 py-6 flex flex-col gap-4"
          >
            {messages.map((m, i) => (
              <MessageBubble
                key={`${m.role}-${i}`}
                message={m}
              />
            ))}

            {view === "planReview" && pendingPlan && (
              <PlanCard
                plan={pendingPlan.plan}
                onConfirm={() => void confirmPlan()}
                onEdit={() => {
                  setPendingPlan(null);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content:
                        "Certo. Me diga o que você quer mudar no plano: nível, tema, quantidade ou contexto.",
                    },
                  ]);
                  setView("chatting");
                  setDraft("");
                }}
              />
            )}

            {(view === "generating" || view === "done") && job && (
              <GenerationProgressCard
                job={job}
                onRetry={(idx) => void handleRetry(idx)}
                onCancel={view === "generating" ? () => void handleCancel() : undefined}
              />
            )}

            {sending && (
              <div className="self-start font-sora text-sm text-[#5E5E5E] flex items-center gap-2">
                <Loader size={14} className="animate-spin" />
                Content Producer está pensando…
              </div>
            )}
          </div>

          {view !== "generating" && view !== "done" && (
            <ChatInput
              value={draft}
              onChange={setDraft}
              onSubmit={() => void sendMessage(draft)}
              disabled={sending}
            />
          )}

          {view === "done" && job && (
            <DoneFooter onStartOver={startOver} />
          )}
        </>
      )}
    </div>
  );
}
