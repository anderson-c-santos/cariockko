import { apiFetch } from "@/lib/api";
import { LessonPlayer } from "@/components/LessonPlayer";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface DialogueExchange {
  id: string;
  lesson_id: string;
  order_index: number;
  speaker: "app" | "student";
  english_text: string;
  portuguese_translation: string;
  audio_url: string | null;
}

interface Lesson {
  id: string;
  title: string;
  level: string;
  exchanges: DialogueExchange[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LessonPage({ params }: PageProps) {
  const { id } = await params;

  let lesson: Lesson | null = null;
  let error: string | null = null;

  try {
    lesson = await apiFetch<Lesson>(`/api/lessons/${id}`);
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Failed to load lesson";
  }

  if (error || !lesson) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/" className="text-blue-600 hover:underline mb-6 block">
          ← Voltar / Back
        </Link>
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Lição não encontrada</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href={`/lessons/${lesson.level}`}
        className="text-blue-600 hover:underline mb-4 block"
      >
        ← Voltar para {lesson.level}
      </Link>

      <h1 className="text-2xl font-bold mb-1">{lesson.title}</h1>
      <p className="text-gray-500 mb-6 capitalize">{lesson.level}</p>

      <LessonPlayer
        lessonId={lesson.id}
        exchanges={lesson.exchanges ?? []}
      />
    </main>
  );
}
