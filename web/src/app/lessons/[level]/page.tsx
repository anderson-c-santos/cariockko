import { apiFetch } from "@/lib/api";
import Link from "next/link";

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
    <main className="max-w-4xl mx-auto px-4 py-12">
      <Link href="/" className="text-blue-600 hover:underline mb-6 block">
        ← Voltar / Back
      </Link>

      <h1 className="text-3xl font-bold mb-2">{titles.pt}</h1>
      <p className="text-gray-600 mb-8">{titles.en} Lessons</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700">Erro ao carregar lições: {error}</p>
        </div>
      )}

      {!lessons || lessons.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Nenhuma lição encontrada</p>
          <p className="text-sm mt-1">No lessons found. Run the seed script first.</p>
          <code className="block mt-4 text-sm bg-gray-100 p-3 rounded">
            docker-compose run --rm api npm run seed-lessons
          </code>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson, index) => (
            <Link
              key={lesson.id}
              href={`/lesson/${lesson.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="text-sm text-gray-500 mb-1">Lição {index + 1}</div>
              <h3 className="text-lg font-semibold">{lesson.title}</h3>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
