import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class FakeChatOpenAI {
    invoke = (...args: unknown[]) => mockInvoke(...args);
  },
}));

const mockSpeechCreate = vi.fn();
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    audio = { speech: { create: (...args: unknown[]) => mockSpeechCreate(...args) } };
  },
}));

const mockUpload = vi.fn();
vi.mock("../lib/storage.js", () => ({
  uploadObject: (...args: unknown[]) => mockUpload(...args),
}));

const mockQuery = vi.fn();
vi.mock("../lib/db.js", () => ({
  get pool() {
    return { query: mockQuery };
  },
}));

import {
  generateLessonContent,
  generateAudio,
  pickTheme,
  createSemaphore,
  generateAndPersistLesson,
  LESSON_THEMES,
  getExistingThemeIndices,
  LESSONS_PER_LEVEL,
  LEVELS,
} from "./lesson-generator.js";

beforeEach(() => {
  mockInvoke.mockReset();
  mockSpeechCreate.mockReset();
  mockUpload.mockReset();
  mockQuery.mockReset();
});

describe("pickTheme", () => {
  it("returns a known theme for a valid index", () => {
    expect(pickTheme("beginner", 0)).toBe(LESSON_THEMES.beginner[0]);
  });

  it("falls back to the first theme for an out-of-range index", () => {
    expect(pickTheme("beginner", 9999)).toBe(LESSON_THEMES.beginner[0]);
  });

  it("falls back to beginner for an unknown level", () => {
    expect(pickTheme("wizard", 0)).toBe(LESSON_THEMES.beginner[0]);
  });
});

describe("createSemaphore", () => {
  it("limits concurrent execution to the given limit", async () => {
    const sem = createSemaphore(2);
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 6 }, () =>
      sem(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
        return active;
      })
    );
    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("rejects when an inner task throws", async () => {
    const sem = createSemaphore(1);
    await expect(
      sem(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});

describe("generateLessonContent", () => {
  it("parses JSON returned in the LLM content", async () => {
    const payload = {
      title: "Greetings",
      exchanges: [
        { order_index: 0, speaker: "app", english_text: "Hi", portuguese_translation: "Olá" },
        { order_index: 1, speaker: "student", english_text: "Hello", portuguese_translation: "Olá" },
      ],
    };
    mockInvoke.mockResolvedValueOnce({ content: `Here you go: ${JSON.stringify(payload)}` });
    const result = await generateLessonContent("beginner", 0);
    expect(result.title).toBe("Greetings");
    expect(result.exchanges).toHaveLength(2);
  });

  it("throws when the LLM output contains no JSON", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "Sorry, no JSON here." });
    await expect(generateLessonContent("beginner", 0)).rejects.toThrow(
      /Failed to generate lesson content/
    );
  });
});

describe("generateAudio", () => {
  it("uploads the audio buffer and returns the URL", async () => {
    mockSpeechCreate.mockResolvedValueOnce({
      arrayBuffer: async () => Buffer.from("fake-audio").buffer,
    });
    mockUpload.mockResolvedValueOnce("http://minio/audio/lessons/abc.mp3");
    const url = await generateAudio("hello", "abc.mp3");
    expect(url).toBe("http://minio/audio/lessons/abc.mp3");
    expect(mockUpload).toHaveBeenCalledWith(
      "lessons/abc.mp3",
      expect.any(Buffer),
      "audio/mpeg"
    );
  });
});

describe("generateAndPersistLesson", () => {
  it("persists the lesson and its exchanges, calling onAudioProgress", async () => {
    const exchanges = Array.from({ length: 3 }, (_, i) => ({
      order_index: i,
      speaker: i % 2 === 0 ? "app" : ("student" as const),
      english_text: `line ${i}`,
      portuguese_translation: `linha ${i}`,
    }));
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify({ title: "Sample", exchanges }),
    });
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "lesson-id", title: "Sample", level: "beginner" }],
        rowCount: 1,
      });
    // 3 audio inserts:
    for (let i = 0; i < exchanges.length; i += 1) {
      mockSpeechCreate.mockResolvedValueOnce({
        arrayBuffer: async () => Buffer.from(`audio-${i}`).buffer,
      });
      mockUpload.mockResolvedValueOnce(`http://minio/${i}.mp3`);
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    }

    const progressEvents: number[] = [];
    const result = await generateAndPersistLesson({
      level: "beginner",
      themeIndex: 0,
      onAudioProgress: (n) => progressEvents.push(n),
    });

    expect(result.lessonId).toBe("lesson-id");
    expect(progressEvents).toEqual([1, 2, 3]);
  });
});

describe("getExistingThemeIndices", () => {
  it("returns 0..N-1 based on the lessons for a level", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "1" }, { id: "2" }, { id: "3" }],
      rowCount: 3,
    });
    const result = await getExistingThemeIndices("beginner");
    expect([...result]).toEqual([0, 1, 2]);
  });
});

describe("constants", () => {
  it("LESSONS_PER_LEVEL is 20", () => {
    expect(LESSONS_PER_LEVEL).toBe(20);
  });

  it("LEVELS contains the three expected levels", () => {
    expect(LEVELS).toEqual(["beginner", "intermediate", "advanced"]);
  });
});
