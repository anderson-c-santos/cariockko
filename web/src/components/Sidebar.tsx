"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BookOpen, Settings } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <aside className="w-16 bg-black flex flex-col items-center py-8 gap-8 shrink-0 min-h-screen">
      <Link href="/" className="text-[#FAFAFA] font-sora font-bold text-base">
        C
      </Link>
      <nav className="flex flex-col gap-1">
        <Link
          href="/"
          className={`p-1.5 flex items-center justify-center ${
            isActive("/") ? "text-[#FAFAFA]" : "text-[#666666] hover:text-[#FAFAFA]"
          }`}
        >
          <LayoutGrid size={18} />
        </Link>
        <Link
          href="/lessons/beginner"
          className={`p-1.5 flex items-center justify-center ${
            isActive("/lessons") || isActive("/lesson")
              ? "text-[#FAFAFA]"
              : "text-[#666666] hover:text-[#FAFAFA]"
          }`}
        >
          <BookOpen size={18} />
        </Link>
        <Link
          href="#"
          className="p-1.5 flex items-center justify-center text-[#666666] hover:text-[#FAFAFA]"
        >
          <Settings size={18} />
        </Link>
      </nav>
    </aside>
  );
}
