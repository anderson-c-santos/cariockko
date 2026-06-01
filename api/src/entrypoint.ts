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

  console.error(
    `Failed to seed all lessons after ${maxRetries} attempts. The API is still running but may serve incomplete data.`
  );
}

async function startServer() {
  console.log("Starting API server...");
  await import("./index.js");
}

async function main() {
  // Start the HTTP server first so healthcheck probes and readiness endpoints
  // respond immediately. Seeding then runs in the background.
  await startServer();

  // Fire-and-forget: seeding runs asynchronously after the server is up.
  // /health/ready will return 503 until seeding finishes, but /health/live
  // will return 200 as soon as the server is up.
  seedIfNeeded().catch((err) => {
    console.error("Background seed error:", err);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
