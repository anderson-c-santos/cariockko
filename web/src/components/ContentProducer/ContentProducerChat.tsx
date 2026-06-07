"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Sparkles,
  X,
  ClipboardList,
  Pencil,
  Check,
  Loader,
  CircleCheck,
  CircleDashed,
  CircleAlert,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  chatWithProducer,
  clearProducerSession,
  getLatestJob,
  getProducerSession,
  retryLesson,
  startGeneration,
  cancelJob,
  type ChatMessage,
  type GenerationPlan,
  type JobSnapshot,
  type LessonProgress,
} from "@/lib/api";
import { subscribeJobEvents } from "@/lib/sse";
import { getOrCreateSessionId } from "@/lib/session";

type View = "welcome" | "chatting" | "planReview" | "generating" | "done";

interface PendingPlan {
  plan: GenerationPlan;
  messageIndex: number;
}

const QUICK_START_MESSAGE = "Gere lições genéricas para mim";

function getLevelLabel(level: "beginner" | "intermediate" | "advanced"): string {
  return { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" }[level];
}

export function ContentProducerChat() {
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
      console.error("Failed to restore session:", err);
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
        setMessages((prev) => [...prev, assistantMessage]);

        if (response.plan && !response.guardrail) {
          setPendingPlan({ plan: response.plan, messageIndex: messages.length + 1 });
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
    [messages.length, sending]
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

      {view === "welcome" && <WelcomeView onQuickStart={() => void sendMessage(QUICK_START_MESSAGE)} />}

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
                isLastAssistant={
                  m.role === "assistant" && i === messages.length - 1
                }
              />
            ))}

            {view === "planReview" && pendingPlan && (
              <PlanCard
                plan={pendingPlan.plan}
                onConfirm={() => void confirmPlan()}
                onEdit={() => {
                  setPendingPlan(null);
                  setView("chatting");
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

function WelcomeView({ onQuickStart }: { onQuickStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="w-14 h-14 rounded-full bg-black text-[#FAFAFA] flex items-center justify-center">
        <Sparkles size={24} />
      </div>
      <div className="flex flex-col gap-2 max-w-md">
        <h1 className="font-sora text-2xl md:text-3xl font-semibold tracking-[-1px] text-black">
          Crie suas lições
        </h1>
        <p className="font-sora text-sm md:text-base text-[#5E5E5E]">
          Diga ao Content Producer o que você quer aprender ou comece com um template rápido.
        </p>
      </div>
      <button
        type="button"
        onClick={onQuickStart}
        className="inline-flex items-center gap-2 border border-[#E5E5E5] hover:border-black px-4 py-3 font-sora text-sm text-black transition-colors"
      >
        <Sparkles size={16} />
        Gerar lições genéricas para mim
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage; isLastAssistant: boolean }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`bubble-${message.role}`}
    >
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-[#DC2626] text-[#FAFAFA] flex items-center justify-center font-mono text-[11px] font-semibold mr-2 mt-1">
          CP
        </div>
      )}
      <div
        className={`max-w-[80%] px-4 py-3 font-sora text-sm leading-relaxed ${
          isUser
            ? "bg-black text-[#FAFAFA] rounded-2xl rounded-tr-sm"
            : "bg-white border border-[#E5E5E5] text-black rounded-2xl rounded-tl-sm"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
      className="border-t border-[#E5E5E5] p-3 md:p-4 bg-[#FAFAFA]"
    >
      <div className="flex items-center gap-2 border border-[#E5E5E5] focus-within:border-black bg-white pr-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Descreva as lições que você quer…"
          className="flex-1 px-3 py-3 font-sora text-sm bg-transparent outline-none placeholder:text-[#999999]"
          aria-label="Mensagem para o Content Producer"
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Enviar"
          className="w-9 h-9 rounded-full bg-black text-[#FAFAFA] flex items-center justify-center disabled:opacity-30"
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </form>
  );
}

function PlanCard({
  plan,
  onConfirm,
  onEdit,
}: {
  plan: GenerationPlan;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const total = plan.lessons.reduce((sum, l) => sum + l.count, 0);
  const levels = Array.from(new Set(plan.lessons.map((l) => l.level)));
  const themes = Array.from(new Set(plan.lessons.map((l) => l.theme)));

  return (
    <div className="border border-[#E5E5E5] bg-white">
      <div className="bg-black text-[#FAFAFA] px-4 py-3 flex items-center gap-2">
        <ClipboardList size={16} />
        <h2 className="font-sora text-sm font-semibold">Plano de Geração / Generation Plan</h2>
      </div>
      <dl className="px-4 py-3 divide-y divide-[#E5E5E5] font-sora text-sm">
        <PlanRow label="Número de lições" value={`${total}`} />
        <PlanRow label="Nível" value={levels.map(getLevelLabel).join(", ")} />
        <PlanRow label="Tema" value={themes.join(", ")} />
        <PlanRow
          label="Personagens"
          value={`${plan.characters.app} & ${plan.characters.student}`}
        />
        <PlanRow
          label="Tempo estimado"
          value={`~${plan.estimatedMinutes} min`}
        />
      </dl>
      <div className="px-4 py-3 flex items-center justify-end gap-2 border-t border-[#E5E5E5]">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 px-3 py-2 border border-[#E5E5E5] hover:border-black font-sora text-sm"
        >
          <Pencil size={14} />
          Editar Plano
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex items-center gap-2 px-3 py-2 bg-[#22C55E] hover:bg-[#16A34A] text-white font-sora text-sm"
        >
          <Check size={14} />
          Confirmar e Gerar
        </button>
      </div>
    </div>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 flex items-center justify-between gap-3">
      <dt className="font-mono text-[11px] tracking-[1px] text-[#5E5E5E] uppercase">
        {label}
      </dt>
      <dd className="text-black text-right">{value}</dd>
    </div>
  );
}

function GenerationProgressCard({
  job,
  onRetry,
  onCancel,
}: {
  job: JobSnapshot;
  onRetry: (lessonIndex: number) => void;
  onCancel?: () => void;
}) {
  const { progress } = job;
  const percent = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="border border-[#E5E5E5] bg-white">
      <div className="bg-black text-[#FAFAFA] px-4 py-3 flex items-center gap-2">
        {job.status === "running" ? (
          <Loader size={16} className="animate-spin" />
        ) : (
          <Check size={16} />
        )}
        <h2 className="font-sora text-sm font-semibold">
          {job.status === "running" ? "Gerando Lições…" : "Geração concluída"}
        </h2>
      </div>
      <div className="px-4 py-3 flex flex-col gap-3 border-b border-[#E5E5E5]">
        <div className="flex items-center justify-between font-sora text-sm text-black">
          <span>
            {progress.completed} de {progress.total} lições criadas
          </span>
          <span className="font-mono text-[11px] tracking-[1px] text-[#5E5E5E]">{percent}%</span>
        </div>
        <div className="h-1.5 bg-[#E5E5E5] overflow-hidden">
          <div
            className="h-full bg-[#22C55E] transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <ul className="px-4 py-2 divide-y divide-[#E5E5E5]">
        {progress.lessons.map((lesson, idx) => (
          <LessonRow key={`${lesson.level}-${lesson.theme}-${idx}`} lesson={lesson} index={idx} onRetry={onRetry} />
        ))}
      </ul>
      {onCancel && (
        <div className="px-4 py-3 border-t border-[#E5E5E5] flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-3 py-2 border border-[#E5E5E5] hover:border-black font-sora text-sm"
          >
            <X size={14} />
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  index,
  onRetry,
}: {
  lesson: LessonProgress;
  index: number;
  onRetry: (idx: number) => void;
}) {
  return (
    <li className="py-2 flex items-center gap-3" data-testid={`lesson-row-${index}`}>
      <StatusIcon status={lesson.status} />
      <div className="flex-1 min-w-0">
        <div className="font-sora text-sm text-black truncate">
          {lesson.title ?? lesson.theme}
        </div>
        <div className="font-mono text-[10px] tracking-[1px] uppercase text-[#5E5E5E]">
          {getLevelLabel(lesson.level)}
          {lesson.error ? ` · ${lesson.error}` : ""}
        </div>
      </div>
      {lesson.status === "failed" && (
        <button
          type="button"
          onClick={() => onRetry(index)}
          className="inline-flex items-center gap-1 px-2 py-1 border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] font-mono text-[10px] tracking-[1px]"
          aria-label="Tentar novamente"
        >
          <RefreshCw size={12} />
          TENTAR NOVAMENTE
        </button>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: LessonProgress["status"] }) {
  if (status === "completed") {
    return <CircleCheck size={18} className="text-[#22C55E] shrink-0" />;
  }
  if (status === "generating") {
    return <Loader size={18} className="text-[#F59E0B] shrink-0 animate-spin" />;
  }
  if (status === "failed") {
    return <CircleAlert size={18} className="text-[#DC2626] shrink-0" />;
  }
  return <CircleDashed size={18} className="text-[#999999] shrink-0" />;
}

function DoneFooter({ onStartOver }: { onStartOver: () => void }) {
  return (
    <div className="border-t border-[#E5E5E5] p-3 md:p-4 bg-[#FAFAFA] flex items-center justify-end">
      <button
        type="button"
        onClick={onStartOver}
        className="inline-flex items-center gap-2 px-3 py-2 font-sora text-sm text-[#5E5E5E] hover:text-black"
      >
        <RotateCcw size={14} />
        Nova conversa
      </button>
    </div>
  );
}
