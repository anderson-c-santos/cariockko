import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { ArrowLeft } from "lucide-react";

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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-16 py-12 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 border border-[#E5E5E5] text-[12px] font-sora font-medium text-black"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>
          <h1 className="font-sora text-2xl font-semibold tracking-[-1px] text-black">
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
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="font-sora text-lg text-[#5E5E5E]">
              Nenhuma lição encontrada
            </p>
            <p className="font-sora text-sm text-[#999999]">
              No lessons found. Run the seed script first.
            </p>
            <code className="mt-4 text-sm bg-[#F5F5F5] p-3 font-mono text-[#5E5E5E]">
              docker-compose run --rm api npm run seed-lessons
            </code>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
