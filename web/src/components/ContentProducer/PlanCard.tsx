"use client";

import { ClipboardList, Pencil, Check } from "lucide-react";
import type { GenerationPlan } from "@/lib/api";

function getLevelLabel(level: "beginner" | "intermediate" | "advanced"): string {
  return { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" }[level];
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

export function PlanCard({
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
