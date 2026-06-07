"use client";

import type { ChatMessage } from "@/lib/api";

export function MessageBubble({ message }: { message: ChatMessage }) {
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
