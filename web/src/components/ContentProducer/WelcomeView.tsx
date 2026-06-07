"use client";

import { Sparkles } from "lucide-react";

export function WelcomeView({
  onQuickStart,
  onGuidedStart,
  defaultFlow,
}: {
  onQuickStart: () => void;
  onGuidedStart: () => void;
  defaultFlow: "quick" | "guided";
}) {
  const primaryQuick = defaultFlow === "quick";
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
          Você pode começar com um plano rápido ou me contar suas preferências para criar suas
          primeiras lições de forma guiada.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg">
        <button
          type="button"
          onClick={primaryQuick ? onQuickStart : onGuidedStart}
          className={`inline-flex items-center justify-center gap-2 px-4 py-3 font-sora text-sm transition-colors border w-full ${
            primaryQuick
              ? "bg-black text-[#FAFAFA] border-black"
              : "bg-white text-black border-[#E5E5E5] hover:border-black"
          }`}
        >
          <Sparkles size={16} />
          {primaryQuick ? "Gerar lições sugeridas" : "Criar com minhas preferências"}
        </button>
        <button
          type="button"
          onClick={primaryQuick ? onGuidedStart : onQuickStart}
          className="inline-flex items-center justify-center gap-2 border border-[#E5E5E5] hover:border-black px-4 py-3 font-sora text-sm text-black transition-colors w-full"
        >
          <Sparkles size={16} />
          {primaryQuick ? "Criar com minhas preferências" : "Gerar lições sugeridas"}
        </button>
      </div>
    </div>
  );
}
