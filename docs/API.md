# API Reference

**Last Updated:** 2026-06-07

Base URL: `http://localhost:3001` in local dev.

## Content Producer

All Content Producer endpoints use browser-scoped `session_id` values like `web-<uuid>`.
No authentication is required.

### `POST /api/content-producer/chat`

Starts or continues the assistant conversation.

Request:
```json
{ "session_id": "web-123", "message": "Quero 5 lições sobre viagens" }
```

Response:
```json
{ "reply": "...", "plan": { "lessons": [], "characters": {}, "estimatedMinutes": 5 } }
```

`plan` and `guardrail` are optional.

Errors:
- `400` invalid body or invalid `session_id`
- `429` rate limit exceeded
- `500` model/runtime failure

### `GET /api/content-producer/session/:sessionId`

Returns persisted chat history.

Response:
```json
{ "session_id": "web-123", "messages": [] }
```

### `DELETE /api/content-producer/session/:sessionId`

Clears the stored chat history for the session.

Response:
```json
{ "ok": true }
```

### `POST /api/content-producer/generate`

Starts a generation job from an approved plan.

Request:
```json
{
  "session_id": "web-123",
  "plan": {
    "lessons": [{ "level": "beginner", "theme": "Ordering coffee", "count": 3 }],
    "characters": { "app": "Aimee", "student": "Todd" },
    "estimatedMinutes": 5
  }
}
```

Response:
```json
{ "job_id": "uuid", "snapshot": { "id": "uuid", "status": "running" } }
```

Constraints:
- up to 20 lesson groups per plan
- up to 20 lessons per group
- max 60 lessons per generation

Errors:
- `400` invalid body / invalid `session_id` / plan too large
- `429` rate limit exceeded
- `500` queue failure

### `GET /api/content-producer/jobs/recent?session_id=...`

Returns the latest job for a session, or `null`.

Response:
```json
{ "snapshot": null }
```

### `GET /api/content-producer/jobs/:jobId`

Returns a job snapshot.

Errors:
- `404` job not found

### `GET /api/content-producer/jobs/:jobId/events`

Server-Sent Events stream.

- `event: progress` → full `JobSnapshot`
- `event: done` → `{ "status": "completed" | "failed" | "cancelled" }`

### `POST /api/content-producer/jobs/:jobId/retry`

Retries one failed lesson.

Request:
```json
{ "lesson_index": 0 }
```

Errors:
- `400` invalid body
- `404` job or lesson not found

### `POST /api/content-producer/jobs/:jobId/cancel`

Cancels an active job.

Errors:
- `409` job is not active

## Other API Areas

See the main `README.md` for the lesson, speaking tutor, and progress endpoints.
