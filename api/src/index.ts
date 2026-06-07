import express from "express";
import cors from "cors";
import multer from "multer";
import { lessonsRouter } from "./routes/lessons.js";
import { speakingTutorRouter } from "./routes/speaking-tutor.js";
import { progressRouter } from "./routes/progress.js";
import { contentProducerRouter } from "./routes/content-producer.js";

const app = express();
const port = process.env.PORT ?? 3001;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Liveness probe: the server is up and accepting connections.
// Used by Docker's healthcheck so the container is marked healthy as soon
// as the HTTP server starts. The app no longer auto-seeds, so the
// container can be marked healthy immediately.
app.get("/health/live", (_req, res) => {
  res.json({ status: "live" });
});

// Readiness probe: the app is ready to serve (DB connected).
// Lessons are now created on demand via the Content Producer, so the
// only thing to check is that the database is reachable.
app.get("/health/ready", async (_req, res) => {
  try {
    const { pool } = await import("./lib/db.js");
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.use("/api/lessons", lessonsRouter);
app.use("/api/speaking-tutor", upload.single("audio"), speakingTutorRouter);
app.use("/api/progress", progressRouter);
app.use("/api/content-producer", contentProducerRouter);

app.listen(port, () => {
  console.log(`Cariockko API running on port ${port}`);
});
