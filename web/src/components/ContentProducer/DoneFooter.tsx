"use client";

import { RotateCcw } from "lucide-react";

export function DoneFooter({ onStartOver }: { onStartOver: () => void }) {
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
