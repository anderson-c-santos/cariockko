import { Router } from "express";
import { pool } from "../lib/db.js";

export const progressRouter = Router();

progressRouter.post("/", async (req, res) => {
  const { session_id, lesson_id, completed } = req.body;

  if (!session_id || !lesson_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const completedAt = completed ? new Date().toISOString() : null;

    const { rows } = await pool.query(
      `INSERT INTO user_progress (session_id, lesson_id, completed, completed_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, lesson_id)
       DO UPDATE SET completed = $3, completed_at = $4
       RETURNING *`,
      [session_id, lesson_id, completed, completedAt]
    );

    res.json(rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

progressRouter.get("/:session_id", async (req, res) => {
  const { session_id } = req.params;

  try {
    const { rows } = await pool.query(
      "SELECT lesson_id, completed, completed_at FROM user_progress WHERE session_id = $1 AND completed = true",
      [session_id]
    );

    res.json(rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
