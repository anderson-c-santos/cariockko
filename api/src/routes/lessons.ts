import { Router } from "express";
import { pool } from "../lib/db.js";

export const lessonsRouter = Router();

lessonsRouter.get("/", async (req, res) => {
  const { level } = req.query;

  try {
    let sql = "SELECT id, title, level, created_at FROM lessons";
    const params: string[] = [];

    if (level) {
      sql += " WHERE level = $1";
      params.push(level as string);
    }

    sql += " ORDER BY created_at";

    const { rows } = await pool.query(sql, params);

    const lessons = await Promise.all(
      rows.map(async (lesson: { id: string }) => {
        const { rows: countRows } = await pool.query(
          "SELECT COUNT(*)::int AS count FROM dialogue_exchanges WHERE lesson_id = $1",
          [lesson.id]
        );
        return { ...lesson, exchange_count: countRows[0]?.count ?? 0 };
      })
    );

    res.json(lessons);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

lessonsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { rows: lessonRows } = await pool.query(
      "SELECT id, title, level, created_at FROM lessons WHERE id = $1",
      [id]
    );

    if (lessonRows.length === 0)
      return res.status(404).json({ error: "Lesson not found" });

    const lesson = lessonRows[0];

    const { rows: exchanges } = await pool.query(
      "SELECT * FROM dialogue_exchanges WHERE lesson_id = $1 ORDER BY order_index",
      [id]
    );

    res.json({ ...lesson, exchanges });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
