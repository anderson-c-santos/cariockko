import express from "express";
import cors from "cors";
import multer from "multer";
import { lessonsRouter } from "./routes/lessons.js";
import { speakingTutorRouter } from "./routes/speaking-tutor.js";
import { progressRouter } from "./routes/progress.js";
import { getLessonCount, EXPECTED_LESSON_COUNT } from "./agents/content-producer.js";

const app = express();
const port = process.env.PORT ?? 3001;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/ready", async (_req, res) => {
  try {
    const count = await getLessonCount();
    if (count >= EXPECTED_LESSON_COUNT) {
      res.json({ status: "ready", lessons: count });
    } else {
      res.status(503).json({ status: "seeding", lessons: count, expected: EXPECTED_LESSON_COUNT });
    }
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.use("/api/lessons", lessonsRouter);
app.use("/api/speaking-tutor", upload.single("audio"), speakingTutorRouter);
app.use("/api/progress", progressRouter);

app.listen(port, () => {
  console.log(`Cariocko API running on port ${port}`);
});
