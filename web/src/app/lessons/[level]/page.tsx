import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { ArrowLeft, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

interface Lesson {
  id: string;
  title: string;
  level: string;
}

interface PageProps {
  params: Promise<{ level: string }>;
}

export default async function LessonsPage({ params }: PageProps) {
  const { level } = await params;

  let lessons: Lesson[] = [];
  let error: string | null = null;

  try {
    lessons = await apiFetch<Lesson[]>(`/api/lessons?level=${level}`);
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Failed to load lessons";
  }

  const levelTitles: Record<string, { pt: string; en: string }> = {
    beginner: { pt: "Iniciante", en: "Beginner" },
    intermediate: { pt: "Intermediário", en: "Intermediate" },
    advanced: { pt: "Avançado", en: "Advanced" },
  };

  const titles = levelTitles[level] ?? { pt: level, en: level };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 px-4 py-6 md:px-16 md:py-12 pb-24 md:pb-12 flex flex-col gap-6 md:gap-8">
        <div className="flex items-center gap-3 md:gap-4 flex-wrap">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 min-h-[40px] border border-[#E5E5E5] text-[12px] font-sora font-medium text-black"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>
          <h1 className="font-sora text-xl md:text-2xl font-semibold tracking-[-1px] text-black">
            {titles.pt}
          </h1>
          {lessons.length > 0 && (
            <span className="px-3 py-1 bg-[#DC2626] text-[#FAFAFA] font-mono text-[11px] font-medium">
              {lessons.length} {lessons.length === 1 ? "lição" : "lições"}
            </span>
          )}
        </div>

        {error && (
          <div className="border border-[#E5E5E5] p-5">
            <p className="font-sora text-sm text-[#DC2626]">
              Erro ao carregar lições: {error}
            </p>
          </div>
        )}

        {!lessons || lessons.length === 0 ? (
          <div className="border border-[#E5E5E5] p-6 flex flex-col items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-black text-[#FAFAFA] flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <h2 className="font-sora text-lg font-semibold text-black">
              Nenhuma lição de {titles.pt.toLowerCase()} ainda
            </h2>
            <p className="font-sora text-sm text-[#5E5E5E]">
              Peça ao Content Producer para criar lições neste nível. Você pode descrever um
              tema ou começar com o template rápido.
            </p>
            <Link
              href="/create-lessons"
              className="inline-flex items-center gap-2 bg-black text-[#FAFAFA] px-4 py-2 font-sora text-sm hover:opacity-90"
            >
              <Sparkles size={16} />
              Criar lições de {titles.pt.toLowerCase()}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson, index) => (
              <Link
                key={lesson.id}
                href={`/lesson/${lesson.id}`}
                className="block border border-[#E5E5E5] hover:border-[#DC2626] transition-colors p-5 pl-6 border-l-4 border-l-[#DC2626]"
              >
                <span className="font-mono text-xs text-[#999999]">
                  Lição {index + 1}
                </span>
                <h3 className="font-sora text-[14px] font-semibold text-black mt-1">
                  {lesson.title}
                </h3>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
