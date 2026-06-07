# Code Deletion Log

## [2026-06-06] Interactive Content Producer - Decouple Seeding From Startup

### Context
The Content Producer was a background process that auto-generated 60 lessons on
first API startup. This coupled app availability to lesson generation — a
mid-seed failure could leave the app blocked, and the catalogue was the same
for every user. The new design moves generation into an interactive "Criar
Lições" tab, where users request and confirm lesson plans through a chat agent
(see `.product/improving-content-producer.md`).

### Behaviour Removed
- `entrypoint.ts` no longer runs `seedIfNeeded()` in the background.
  The `seedLessons()` function is still exported (now from
  `api/src/agents/content-producer.ts` as a thin wrapper around
  `lesson-generator.ts`) so the `npm run seed-lessons` script keeps
  working for demos and manual population.
- `/health/ready` no longer polls lesson counts. It only verifies that
  PostgreSQL is reachable, since the readiness condition is now
  "DB up" — not "60 lessons generated".
- `EXPECTED_LESSON_COUNT` and `LESSONS_PER_LEVEL` (old constants in
  `content-producer.ts`) are gone. The new `lesson-generator.ts` keeps
  the same numeric defaults but the API no longer gates readiness on
  them.

### UI Removed
- The home page and `lessons/[level]` page used to show a
  `docker-compose run … npm run seed-lessons` empty state. Replaced
  with a friendly CTA pointing at the new Content Producer tab.

### Code Moved / Refactored
- `generateLessonContent`, `generateAudio`, `LESSON_THEMES`,
  `LEVEL_INSTRUCTIONS`, `createSemaphore` and `generateAndPersistLesson`
  moved from `api/src/agents/content-producer.ts` to a new
  `api/src/agents/lesson-generator.ts`. The old file now just contains
  the `seedLessons()` wrapper.
- New `api/src/agents/content-producer-chat.ts` holds the conversational
  agent (LangChain `withStructuredOutput`, heuristic guardrail
  pre-filter, JSONB-persisted history).
- New `api/src/lib/generation-queue.ts` runs the asynchronous lesson
  generation pipeline with per-lesson status, in-memory subscribers
  for SSE, retry support, and crash-recovery hooks called from
  `entrypoint.ts` on boot.
- New `api/src/lib/sse.ts` wraps `text/event-stream` response setup,
  with a 15-second keep-alive comment.
- New `api/src/lib/rate-limit.ts` is a tiny token-bucket middleware
  used to cap chat and generation requests per session.
- New `api/src/routes/content-producer.ts` exposes the
  `/api/content-producer/*` surface (chat, session, generate, jobs,
  events, retry, cancel).
- DB pool size in `api/src/lib/db.ts` bumped from 10 to 20 to leave
  headroom for parallel generation + SSE subscribers.

### Make Commands Removed
- `make seed-status` — no longer meaningful; removed.
- `make wait-ready` — only useful while auto-seeding; removed.

### Impact
- The first `make start` is now fast (no 5–10 minute wait).
- Lessons only exist if a user created them.
- A new user lands on the home page and gets a clear "criar minhas
  primeiras lições" CTA.

### Testing Completed
- [x] TypeScript compilation passes (api)
- [x] TypeScript compilation passes (web)
- [x] All vitest suites pass (api + web, 67 tests total)
- [x] No lint errors

---

## [2026-03-21] Refactor Session - Simplify Supabase Setup

### Context
User reported issues with Supabase initialization and Docker services restarting. Goal is to simplify the setup for local development without complex authentication/key management.

### Unused Dependencies Removed
- `uuid` (v11.0.0) - Never imported or used anywhere in the codebase
- `@types/uuid` - Type definitions for unused uuid package

### Unused Files Deleted
- `web/src/components/SessionInit.tsx` - Exported component but never imported in any page/layout

### Code Simplified
- `api/src/lib/supabase.ts` - Removed complex JWT signing/validation logic
  - Removed `base64UrlEncode()` function
  - Removed `signJwt()` function
  - Removed `isValidJwtSignature()` function
  - Removed `buildSupabaseServiceKey()` function
  - Simplified to directly use service key or fallback to anon key for local dev

- `web/src/lib/supabase.ts` - Simplified Supabase client
  - Removed complex Proxy pattern
  - Removed error throwing for missing anon key (use empty string fallback)
  - Simplified to direct lazy initialization

- `.env` and `.env.example` - Updated with proper defaults for local development
  - Added comments explaining local dev setup
  - Set meaningful default values

### Impact
- Files deleted: 1
- Dependencies removed: 2
- Lines of code removed: ~80
- Simplified Supabase connection logic for local development

### Testing Completed
- [x] TypeScript compilation passes (api)
- [x] TypeScript compilation passes (web)
- [x] No lint errors

### Benefits
1. **Simpler setup** - No need to generate/validate JWT tokens locally
2. **Fewer dependencies** - Removed unused uuid package
3. **Cleaner code** - Removed dead code and unused components
4. **Better defaults** - .env files have meaningful defaults for local dev
