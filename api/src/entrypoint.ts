import "dotenv/config";
import {
  seedLessons,
  getLessonCount,
  EXPECTED_LESSON_COUNT,
} from "./agents/content-producer.js";

async function seedIfNeeded() {
  const count = await getLessonCount();

  if (count >= EXPECTED_LESSON_COUNT) {
    console.log(`Found ${count}/${EXPECTED_LESSON_COUNT} lessons. Skipping seed.`);
    return;
  }

  console.log(
    `Found ${count}/${EXPECTED_LESSON_COUNT} lessons. Running seed...`
  );

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await seedLessons();
      const finalCount = await getLessonCount();
      if (finalCount >= EXPECTED_LESSON_COUNT) {
        console.log(`Seed complete: ${finalCount}/${EXPECTED_LESSON_COUNT} lessons.`);
        return;
      }
      console.warn(
        `Seed attempt ${attempt}: ${finalCount}/${EXPECTED_LESSON_COUNT} lessons. Retrying...`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Seed attempt ${attempt} failed: ${message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw new Error(
    `Failed to seed all lessons after ${maxRetries} attempts`
  );
}

async function startServer() {
  console.log("Starting API server...");
  await import("./index.js");
}

async function main() {
  await seedIfNeeded();
  await startServer();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
