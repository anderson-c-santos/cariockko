import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import { z } from "zod";
import { pool } from "../lib/db.js";
import { uploadObject } from "../lib/storage.js";

const openai = new OpenAI();

export interface DialogueExchange {
  order_index: number;
  speaker: "app" | "student";
  english_text: string;
  portuguese_translation: string;
}

export const LESSON_THEMES: Record<string, string[]> = {
  beginner: [
    "Meeting someone new and introducing yourself",
    "Ordering food at a restaurant",
    "Asking for directions in a city",
    "Shopping for clothes at a store",
    "Introducing your family members",
    "Talking about the weather",
    "Using public transport",
    "Saying phone numbers and dates",
    "Telling the time",
    "Describing your home",
    "Counting and buying at a market",
    "Apologizing and excusing yourself",
    "Talking about colours and clothes",
    "Days of the week and the calendar",
    "Visiting the doctor with basic symptoms",
    "Talking about school and studying",
    "Describing a simple hobby",
    "Booking a hotel room",
    "At the airport check-in",
    "Asking where the bathroom is",
  ],
  intermediate: [
    "Making plans for the weekend with a friend",
    "Talking about your job and daily routine",
    "Discussing a movie you recently watched",
    "Shopping in a mall and comparing prices",
    "Talking about your favourite sport",
    "Renting an apartment",
    "Planning a birthday celebration",
    "Following a recipe while cooking",
    "Asking a colleague for help at work",
    "Sharing travel experiences",
    "Discussing health and exercise routines",
    "Telling stories about your weekend",
    "Booking a dentist appointment",
    "Chatting about local news",
    "Talking about music taste",
    "Dealing with car trouble at a mechanic",
    "Opening a bank account",
    "Discussing social media habits",
    "Describing your neighbourhood",
    "Complaining politely about a service",
  ],
  advanced: [
    "Debating the pros and cons of remote work",
    "Discussing climate change and possible solutions",
    "Sharing opinions about technology and society",
    "Debating immigration policy",
    "Analysing a news article",
    "Discussing geopolitics and international relations",
    "Mental health and modern life",
    "The future of artificial intelligence",
    "Urban planning and smart cities",
    "Comparing healthcare systems",
    "Social inequality and economic mobility",
    "The role of media and journalism today",
    "Philosophy of happiness and well-being",
    "Sustainable fashion and ethical consumption",
    "Work-life balance in the digital age",
    "Ethics of social media platforms",
    "Impact of globalisation on local cultures",
    "Gender equality in the workplace",
    "The housing crisis in major cities",
    "Cultural identity in a diaspora community",
  ],
};

const LEVEL_INSTRUCTIONS: Record<string, string> = {
  beginner:
    "Use very simple vocabulary. Short sentences (5-10 words). Basic present tense mostly. Greetings, numbers, colors, common objects. Assume the student knows almost no English.",
  intermediate:
    "Use everyday vocabulary. Medium-length sentences. Mix of tenses. Topics like work, travel, hobbies, food. Assume the student can handle basic conversations.",
  advanced:
    "Use rich vocabulary and idioms. Longer, complex sentences. All tenses. Abstract topics, opinions, nuanced discussion. Assume the student can follow complex dialogue.",
};

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const LESSONS_PER_LEVEL = 20;

const UNIQUE_TITLE_INDEX_NAME = "lessons_title_lower_unique_idx";
let ensureTitleIndexPromise: Promise<void> | null = null;

export function pickTheme(level: string, themeIndex: number): string {
  const themes = LESSON_THEMES[level] ?? LESSON_THEMES.beginner;
  return themes[themeIndex] ?? themes[0];
}

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

function isProbablyEnglishTitle(title: string): boolean {
  if (!title.trim()) return false;
  if (/[^\x00-\x7F]/.test(title)) return false;
  return !/(\b(li[cç][aã]o|li[cç][oõ]es|aula|aulas|você|para|com|sobre|tema|nível|iniciant[eé]|intermedi[aá]rio|avançad[ao]|vocabul[aá]rio|diálogo|di[aá]logo)\b)/i.test(title);
}

export async function ensureLessonTitleIndex(): Promise<void> {
  if (!ensureTitleIndexPromise) {
    ensureTitleIndexPromise = pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${UNIQUE_TITLE_INDEX_NAME}
       ON lessons (LOWER(title))`
    ).then(() => undefined);
  }
  await ensureTitleIndexPromise;
}

async function titleExists(title: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM lessons WHERE LOWER(title) = LOWER($1)) AS exists",
    [title]
  );
  return rows[0]?.exists ?? false;
}

function buildTitleModel() {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini",
    temperature: 0.2,
  });
}

function extractTitleCandidate(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as { title?: unknown };
      if (typeof parsed.title === "string" && parsed.title.trim()) return parsed.title.trim();
    } catch {
      return trimmed;
    }
    return trimmed;
  }

  if (typeof raw === "object" && raw !== null) {
    const maybeRecord = raw as Record<string, unknown>;
    const title = maybeRecord.title;
    if (typeof title === "string" && title.trim()) return title.trim();
    const content = maybeRecord.content;
    if (typeof content === "string" && content.trim()) {
      try {
        const parsed = JSON.parse(content) as { title?: unknown };
        if (typeof parsed.title === "string" && parsed.title.trim()) return parsed.title.trim();
      } catch {
        return content.trim();
      }
      return content.trim();
    }
  }

  return null;
}

async function rewriteLessonTitle(
  level: string,
  theme: string,
  draftTitle: string,
  existingTitles: string[]
): Promise<string> {
  const llm = buildTitleModel();
  const raw = await llm.invoke([
    {
      role: "system",
      content: [
        "You write short lesson titles for English-learning lessons.",
        "Return only an English title.",
        "Do not use Portuguese.",
        "Avoid repeating existing titles.",
        "Keep it concise and natural.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Level: ${level}\nTheme: ${theme}\nDraft title: ${draftTitle}\nExisting titles: ${existingTitles.join(" | ")}`,
    },
  ]);

  const candidate = extractTitleCandidate(raw);
  if (!candidate) {
    throw new Error("Failed to generate an English lesson title");
  }
  return candidate;
}

export async function ensureUniqueEnglishLessonTitle(
  level: string,
  theme: string,
  draftTitle: string,
  existingTitles: string[] = []
): Promise<string> {
  const seen = new Set(existingTitles.map(normalizeTitleKey));
  let candidate = draftTitle.trim();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (candidate && isProbablyEnglishTitle(candidate) && !seen.has(normalizeTitleKey(candidate))) {
      return candidate;
    }

    const refreshed = existingTitles.concat([...seen]);
    candidate = await rewriteLessonTitle(level, theme, candidate || theme, refreshed);
  }

  throw new Error("Unable to generate a unique English lesson title");
}

async function insertLessonWithTitle(level: string, theme: string, title: string): Promise<{ id: string; title: string; level: string }> {
  const { rows } = await pool.query(
    "INSERT INTO lessons (title, level) VALUES ($1, $2) RETURNING *",
    [title, level]
  );
  const lesson = rows[0];
  if (!lesson) {
    throw new Error(`Failed to insert lesson row for ${theme}`);
  }
  return lesson;
}

/**
 * Generate lesson content for a given level.
 * Pass either a numeric `themeIndex` (index into the built-in LESSON_THEMES
 * list) OR a free-form `themeString` (user-supplied topic). When both are
 * provided, `themeString` takes precedence so custom Mode-B requests are
 * not silently remapped to an index-0 fallback.
 */
export async function generateLessonContent(
  level: string,
  themeIndex: number,
  themeString?: string
): Promise<{ title: string; exchanges: DialogueExchange[] }> {
  const theme = themeString?.trim() || pickTheme(level, themeIndex);

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini",
    temperature: 0.8,
  });

  const response = await llm.invoke([
    {
      role: "system",
      content: `You are an English lesson content creator for Brazilian students.
Generate a natural dialogue between two characters: "Aimee" (app) and "Todd" (student).

${LEVEL_INSTRUCTIONS[level]}

        Return ONLY a JSON object.
        The title must be in English, concise, and unique among lesson titles.
        {
          "title": "lesson title in English",
  "exchanges": [
    {
      "order_index": 0,
      "speaker": "app",
      "english_text": "the line",
      "portuguese_translation": "Brazilian Portuguese translation"
    }
  ]
}

Rules:
- Generate exactly 10 exchanges
- Alternate speakers: app, student, app, student...
- First speaker is always "app" (Aimee)
- Each line should flow naturally from the previous one
- Translations should be natural Brazilian Portuguese, not literal
        - The title should be a short English phrase describing the lesson theme
        - Never use Portuguese in the title
        - Avoid titles that sound identical to existing lesson titles`,
    },
    {
      role: "user",
      content: `Create a lesson about: "${theme}"
Level: ${level}`,
    },
  ]);

  const content = response.content as string;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to generate lesson content");
  }

  return JSON.parse(jsonMatch[0]) as {
    title: string;
    exchanges: DialogueExchange[];
  };
}

export async function generateAudio(
  text: string,
  filename: string
): Promise<string> {
  const speech = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "marin",
    input: text,
    instructions: "Speak in a calm and friendly tone.",
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  const key = `lessons/${filename}`;

  return uploadObject(key, buffer, "audio/mpeg");
}

export interface GenerateLessonOptions {
  level: string;
  themeIndex: number;
  /** Optional free-form topic string (overrides themeIndex lookup). */
  themeString?: string;
  onAudioProgress?: (completed: number, total: number) => void;
}

export interface GenerateLessonResult {
  lessonId: string;
  title: string;
  level: string;
}

/**
 * Generates a single lesson (content + audio for all exchanges) and persists
 * it to the database. Isolated so it can run in parallel with other lessons.
 */
export async function generateAndPersistLesson(
  options: GenerateLessonOptions
): Promise<GenerateLessonResult> {
  await ensureLessonTitleIndex();
  const { level, themeIndex, themeString, onAudioProgress } = options;
  const lessonLabel = themeString ?? `${level} lesson ${themeIndex + 1}`;

  const { title: draftTitle, exchanges } = await generateLessonContent(level, themeIndex, themeString);
  const { rows: titleRows } = await pool.query<{ title: string }>(
    "SELECT title FROM lessons"
  );
  const existingTitles = titleRows.map((row) => row.title);

  let title = await ensureUniqueEnglishLessonTitle(
    level,
    themeString ?? pickTheme(level, themeIndex),
    draftTitle,
    existingTitles
  );

  let lesson: { id: string; title: string; level: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await titleExists(title)) {
      const refreshedTitles = (await pool.query<{ title: string }>("SELECT title FROM lessons")).rows.map(
        (row) => row.title
      );
      title = await ensureUniqueEnglishLessonTitle(
        level,
        themeString ?? pickTheme(level, themeIndex),
        `${draftTitle} (${attempt + 2})`,
        refreshedTitles
      );
      continue;
    }

    try {
      lesson = await insertLessonWithTitle(level, lessonLabel, title);
      break;
    } catch (err) {
      const isUniqueViolation =
        typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
      if (!isUniqueViolation) {
        throw err;
      }

      const refreshedTitles = (await pool.query<{ title: string }>("SELECT title FROM lessons")).rows.map(
        (row) => row.title
      );
      lesson = null;
      title = await ensureUniqueEnglishLessonTitle(
        level,
        themeString ?? pickTheme(level, themeIndex),
        `${draftTitle} (${attempt + 2})`,
        refreshedTitles
      );
    }
  }

  if (!lesson) {
    throw new Error(`Failed to insert lesson row for ${lessonLabel}`);
  }

  let completedAudio = 0;
  await Promise.all(
    exchanges.map(async (exchange) => {
      const audioUrl = await generateAudio(
        exchange.english_text,
        `${lesson.id}_${exchange.order_index}.mp3`
      );

      await pool.query(
        `INSERT INTO dialogue_exchanges (lesson_id, order_index, speaker, english_text, portuguese_translation, audio_url)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          lesson.id,
          exchange.order_index,
          exchange.speaker,
          exchange.english_text,
          exchange.portuguese_translation,
          audioUrl,
        ]
      );

      // Pre-increment so the value captured by the callback is always
      // the final count after this exchange — avoids a stale read in
      // concurrent microtask continuations.
      onAudioProgress?.(++completedAudio, exchanges.length);
    })
  );

  return { lessonId: lesson.id, title, level };
}

export async function getLessonCount(): Promise<number> {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM lessons");
  return rows[0]?.count ?? 0;
}

/**
 * Simple semaphore to limit concurrency without adding extra dependencies.
 * Exported so the generation queue can reuse the same primitive.
 */
export function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active--;
    if (queue.length > 0) {
      active++;
      queue.shift()!();
    }
  }

  return async function acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (active < limit) {
      active++;
      try {
        return await fn();
      } finally {
        release();
      }
    }
    return new Promise<T>((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          release();
        }
      });
    });
  };
}

export async function getExistingThemeIndices(level: string): Promise<Set<number>> {
  // Theme index is implicit: lessons for a level are returned in creation
  // order, so their 0-based index within that level = themeIndex.
  const { rows } = await pool.query(
    "SELECT id FROM lessons WHERE level = $1 ORDER BY created_at",
    [level]
  );
  return new Set(rows.map((_, i) => i));
}
