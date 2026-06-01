import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Explicit pool sizing. During parallel seeding (concurrency=3 lessons,
  // each with 10 exchanges) peak connections can reach ~10. Keeping max at 10
  // avoids "too many connections" while still serving concurrent HTTP requests.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
