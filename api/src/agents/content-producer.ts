import "dotenv/config";
import { pool } from "../lib/db.js";
import {
  LESSONS_PER_LEVEL,
  LEVELS,
  createSemaphore,
  generateAndPersistLesson,
  getExistingThemeIndices,
  getLessonCount,
} from "./lesson-generator.js";

/**
 * Legacy entry point. The application no longer auto-seeds lessons on
 * startup; this helper stays here so the `npm run seed-lessons` script
 * (and any operator who wants to bulk-populate the catalogue) still works.
 */
export async function seedLessons(): Promise<void> {
  await pool.query(
    `DELETE FROM lessons WHERE id NOT IN (SELECT DISTINCT lesson_id FROM dialogue_exchanges)`
  );

  const SEED_CONCURRENCY = parseInt(process.env.SEED_CONCURRENCY ?? "3", 10);

  for (const level of LEVELS) {
    const existing = await getExistingThemeIndices(level);
    const toGenerate = Array.from(
      { length: LESSONS_PER_LEVEL - existing.size },
      (_, i) => existing.size + i
    );

    if (toGenerate.length === 0) {
      console.log(`[seed] ${level}: ${existing.size} lessons already exist. Skipping.`);
      continue;
    }

    console.log(
      `[seed] ${level}: generating ${toGenerate.length} lessons with concurrency=${SEED_CONCURRENCY}...`
    );

    const acquire = createSemaphore(SEED_CONCURRENCY);

    const results = await Promise.allSettled(
      toGenerate.map((themeIndex) =>
        acquire(() => generateAndPersistLesson({ level, themeIndex }))
      )
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.warn(
        `[seed] ${level}: ${failures.length}/${toGenerate.length} lessons failed:`
      );
      failures.forEach((r) => {
        if (r.status === "rejected") {
          console.warn(`  - ${r.reason instanceof Error ? r.reason.message : r.reason}`);
        }
      });
    }

    const successes = results.filter((r) => r.status === "fulfilled").length;
    console.log(`[seed] ${level}: ${successes}/${toGenerate.length} lessons generated.`);
  }

  const finalCount = await getLessonCount();
  console.log(`[seed] Seeding complete. Total lessons: ${finalCount}`);
}
