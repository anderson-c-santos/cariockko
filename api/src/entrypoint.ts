import "dotenv/config";
import { pool } from "./lib/db.js";

async function recoverInterruptedJobs(): Promise<void> {
  // If the API crashes mid-generation, any `running` job rows are stale —
  // mark them as failed so the user can see the situation and retry.
  // Persisted lessons from a previous boot are untouched.
  const { rowCount } = await pool.query(
    `UPDATE lesson_generation_jobs
     SET status = 'failed',
         error = COALESCE(error, 'Server restarted before generation completed'),
         updated_at = now()
     WHERE status IN ('pending', 'running')`
  );
  if (rowCount && rowCount > 0) {
    console.log(`[startup] Marked ${rowCount} interrupted job(s) as failed.`);
  }
}

async function main(): Promise<void> {
  console.log("Starting API server...");

  await recoverInterruptedJobs();

  await import("./index.js");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
