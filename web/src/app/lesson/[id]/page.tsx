import { apiFetch } from "@/lib/api";
import { LessonPlayer } from "@/components/LessonPlayer";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { ArrowLeft } from "lucide-react";

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
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 px-16 py-12">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 border border-[#E5E5E5] text-[12px] font-sora font-medium text-black w-fit mb-6"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="font-sora text-lg text-[#5E5E5E]">
              Lição não encontrada
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-16 py-12 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link
            href={`/lessons/${lesson.level}`}
            className="flex items-center gap-2 px-3 py-2 border border-[#E5E5E5] text-[12px] font-sora font-medium text-black"
          >
            <ArrowLeft size={16} />
            Voltar para {lesson.level}
          </Link>
          <h1 className="font-sora text-2xl font-semibold tracking-[-1px] text-black">
            {lesson.title}
          </h1>
        </div>

        <LessonPlayer
          lessonId={lesson.id}
          exchanges={lesson.exchanges ?? []}
        />
      </main>
    </div>
  );
}
