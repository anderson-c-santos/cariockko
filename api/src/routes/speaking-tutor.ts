import { Router } from "express";
import { speakingTutorAgent } from "../agents/speaking-tutor.js";
import { pool } from "../lib/db.js";

export const speakingTutorRouter = Router();

speakingTutorRouter.post("/", async (req, res) => {
  try {
    const file = req.file;
    const { lesson_id, exchange_index, expected_text } = req.body;

    console.log(`[speaking-tutor-route] Request received. File: ${file ? `${file.size} bytes, type: ${file.mimetype}` : "missing"}, lesson_id: ${lesson_id}, exchange_index: ${exchange_index}`);

    if (!file || !lesson_id || exchange_index === undefined || !expected_text) {
      console.error("[speaking-tutor-route] Missing required fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      console.error(`[speaking-tutor-route] File too large: ${file.size} bytes`);
      return res.status(400).json({ error: "Arquivo de áudio muito grande. Máximo 10MB." });
    }

    // Allow common browser-recorded mimetypes. iOS Safari produces
    // audio/mp4 (m4a); Chromium/Firefox produce audio/webm. Some browsers
    // append codec parameters, so match by prefix as well.
    const allowedTypes = [
      "audio/webm",
      "audio/mp3",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
    ];
    const baseType = file.mimetype.split(";")[0]!.trim().toLowerCase();
    if (!allowedTypes.includes(baseType)) {
      console.error(`[speaking-tutor-route] Unsupported mimetype: ${file.mimetype}`);
      return res.status(400).json({ error: "Tipo de arquivo não suportado. Use webm, mp4, mp3, wav ou ogg." });
    }

    const { rows: exchanges } = await pool.query(
      "SELECT * FROM dialogue_exchanges WHERE lesson_id = $1 AND order_index <= $2 ORDER BY order_index",
      [lesson_id, parseInt(exchange_index)]
    );

    console.log(`[speaking-tutor-route] Found ${exchanges.length} exchanges for context`);

    const result = await speakingTutorAgent({
      audioBuffer: file.buffer,
      audioMimeType: file.mimetype,
      audioFilename: file.originalname,
      lessonContext: exchanges ?? [],
      expectedText: expected_text,
      exchangeIndex: parseInt(exchange_index),
    });

    console.log(`[speaking-tutor-route] Agent result: correct=${result.is_correct}`);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[speaking-tutor-route] Error: ${message}`, err);
    res.status(500).json({ error: message });
  }
});
