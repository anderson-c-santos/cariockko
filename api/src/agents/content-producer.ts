import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import { pool } from "../lib/db.js";
import { uploadObject } from "../lib/storage.js";

const openai = new OpenAI();

interface DialogueExchange {
  order_index: number;
  speaker: "app" | "student";
  english_text: string;
  portuguese_translation: string;
}

const LESSON_THEMES: Record<string, string[]> = {
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

export async function generateLessonContent(
  level: string,
  themeIndex: number
): Promise<{ title: string; exchanges: DialogueExchange[] }> {
  const themes = LESSON_THEMES[level];
  const theme = themes[themeIndex] ?? themes[0];

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

Return ONLY a JSON object:
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
- The title should be a short phrase describing the lesson theme`
    },
    {
      role: "user",
      content: `Create a lesson about: "${theme}"
Level: ${level}`
    }
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

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const LESSONS_PER_LEVEL = 20;
export const EXPECTED_LESSON_COUNT = LEVELS.length * LESSONS_PER_LEVEL;

export async function getLessonCount(): Promise<number> {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM lessons");
  return rows[0]?.count ?? 0;
}

export async function seedLessons() {
  await pool.query(
    `DELETE FROM lessons WHERE id NOT IN (SELECT DISTINCT lesson_id FROM dialogue_exchanges)`
  );

  for (const level of LEVELS) {
    const { rows: existing } = await pool.query(
      "SELECT id FROM lessons WHERE level = $1",
      [level]
    );
    const existingCount = existing.length;
    const themes = LESSON_THEMES[level];

    if (existingCount >= LESSONS_PER_LEVEL) {
      console.log(`${level}: ${existingCount} lessons already exist. Skipping.`);
      continue;
    }

    for (let i = existingCount; i < LESSONS_PER_LEVEL; i++) {
      console.log(`Generating ${level} lesson ${i + 1}/${LESSONS_PER_LEVEL}...`);

      const { title, exchanges } = await generateLessonContent(level, i);

      const { rows: lessonRows } = await pool.query(
        "INSERT INTO lessons (title, level) VALUES ($1, $2) RETURNING *",
        [title, level]
      );

      const lesson = lessonRows[0];
      if (!lesson) {
        console.error(`Failed to insert lesson`);
        continue;
      }

      for (const exchange of exchanges) {
        let audioUrl: string | null = null;

        console.log(`  Generating audio for exchange ${exchange.order_index}...`);
        audioUrl = await generateAudio(
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
      }

      console.log(`  Created: "${title}"`);
    }
  }

  console.log("\nSeeding complete!");
}
