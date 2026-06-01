import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";

const levels = [
  {
    id: "beginner",
    title: "Beginner",
    titlePt: "Iniciante",
    description: "Vocabulário simples e conversas básicas",
  },
  {
    id: "intermediate",
    title: "Intermediate",
    titlePt: "Intermediário",
    description: "Tópicos do dia a dia e frases mais longas",
  },
  {
    id: "advanced",
    title: "Advanced",
    titlePt: "Avançado",
    description: "Discussões complexas e linguagem sofisticada",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 px-4 py-6 md:px-16 md:py-12 pb-24 md:pb-12 flex flex-col gap-8 md:gap-12">
        <div className="flex flex-col gap-3">
          <h1 className="font-sora text-3xl md:text-[48px] font-semibold tracking-[-1px] md:tracking-[-2px] text-black">
            Cariockko
          </h1>
          <p className="font-sora text-sm text-[#5E5E5E]">
            Aprenda inglês conversando / Practice English through interactive dialogues
          </p>
        </div>

        <h2 className="font-sora text-xl md:text-2xl font-semibold tracking-[-1px] text-black">
          Escolha seu nível / Choose your level
        </h2>

        <div className="flex flex-col gap-4 md:gap-6">
          {levels.map((level) => (
            <Link key={level.id} href={`/lessons/${level.id}`} className="block">
              <div className="flex border border-[#E5E5E5] hover:border-[#DC2626] transition-colors">
                <div className="w-1 bg-[#DC2626] shrink-0" />
                <div className="p-5 pl-6 flex flex-col gap-2 flex-1">
                  <span className="font-mono text-xs font-medium tracking-[1px] text-[#5E5E5E]">
                    {level.titlePt.toUpperCase()}
                  </span>
                  <h3 className="font-sora text-xl md:text-2xl font-semibold tracking-[-1px] text-black">
                    {level.title}
                  </h3>
                  <p className="font-sora text-[13px] text-[#5E5E5E]">
                    {level.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
