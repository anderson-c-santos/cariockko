"use client";

import { Check, Loader, X, CircleCheck, CircleDashed, CircleAlert, RefreshCw } from "lucide-react";
import type { JobSnapshot, LessonProgress } from "@/lib/api";

function getLevelLabel(level: "beginner" | "intermediate" | "advanced"): string {
  return { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" }[level];
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

export function GenerationProgressCard({
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
