import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Pool sized for the post-seed steady state: the interactive Content
  // Producer runs concurrent lesson generation (default 3 lessons in
  // parallel, each inserting 10 exchanges) while a browser tab may be
  // holding an SSE connection that pings the DB. 20 leaves headroom
  // without overwhelming PostgreSQL's default 100-connection cap.
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
