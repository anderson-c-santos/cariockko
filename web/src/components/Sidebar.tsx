"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BookOpen, Sparkles, Settings } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const navItems = [
    {
      href: "/",
      icon: LayoutGrid,
      label: "Início",
      active: isActive("/"),
    },
    {
      href: "/lessons/beginner",
      icon: BookOpen,
      label: "Lições",
      active: isActive("/lessons") || isActive("/lesson"),
    },
    {
      href: "/create-lessons",
      icon: Sparkles,
      label: "Criar",
      active: isActive("/create-lessons"),
    },
    {
      href: "#",
      icon: Settings,
      label: "Ajustes",
      active: false,
      disabled: true,
    },
  ];

  return (
    <>
      {/* Desktop: vertical left rail (md and up) */}
      <aside className="hidden md:flex w-16 bg-black flex-col items-center py-8 gap-8 shrink-0 min-h-screen">
        <Link href="/" className="text-[#FAFAFA] font-sora font-bold text-base">
          C
        </Link>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, icon: Icon, label, active, disabled }) =>
            disabled ? (
              <span
                key={label}
                aria-disabled
                aria-label={`${label} (em breve)`}
                className="p-1.5 flex items-center justify-center text-[#3a3a3a] cursor-not-allowed"
              >
                <Icon size={18} />
              </span>
            ) : (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className={`p-1.5 flex items-center justify-center ${
                  active ? "text-[#FAFAFA]" : "text-[#666666] hover:text-[#FAFAFA]"
                }`}
              >
                <Icon size={18} />
              </Link>
            )
          )}
        </nav>
      </aside>

      {/* Mobile: fixed bottom tab bar (below md) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-black border-t border-[#222] flex justify-around items-stretch pb-safe"
        aria-label="Navegação principal"
      >
        {navItems.map(({ href, icon: Icon, label, active, disabled }) =>
          disabled ? (
            <span
              key={label}
              aria-disabled
              aria-label={`${label} (em breve)`}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[#3a3a3a] ${
                active ? "text-[#FAFAFA]" : "text-[#666666]"
              }`}
            >
              <Icon size={20} />
              <span className="font-mono text-[10px] tracking-[1px]">{label}</span>
            </span>
          ) : (
            <Link
              key={label}
              href={href}
              aria-label={label}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] ${
                active ? "text-[#FAFAFA]" : "text-[#666666]"
              }`}
            >
              <Icon size={20} />
              <span className="font-mono text-[10px] tracking-[1px]">{label}</span>
            </Link>
          )
        )}
      </nav>
    </>
  );
}
