"use client";

import { ArrowUp } from "lucide-react";

export function ChatInput({
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
