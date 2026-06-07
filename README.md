# Cariockko

**Learn English by talking** — An open-source English language-learning app designed for the Brazilian community.

Cariockko gives you a safe, judgment-free environment to practice listening and speaking English through interactive, AI-powered role-play conversations.

## Why Cariockko?

- Only ~5% of Brazilians have any knowledge of English, with less than 1–5% considered fluent
- Many face stigma and judgment from peers while learning
- International platforms assume basic English knowledge that most Brazilians don't have
- Tailored courses are often prohibitively expensive

Cariockko solves this by providing an accessible, private space where students practice at their own level with instant AI feedback in Brazilian Portuguese.

## How It Works

### Creating lessons

The **Content Producer** is an in-app assistant that creates lessons tailored to your goals. It runs in a dedicated **Criar Lições** tab — open it from the sidebar (sparkles icon).

1. **Welcome** — pick the quick-start template ("Gerar lições genéricas para mim") or type your own request.
2. **Conversation** — the agent asks 1–2 short questions (count, level, theme) if anything is missing.
3. **Plan review** — when the agent has enough, it shows a `Generation Plan` card with the exact lessons, levels, theme, characters and estimated time. Edit if you want, or hit **Confirmar e Gerar**.
4. **Live progress** — the generation card streams per-lesson status updates via SSE. You can navigate away from the tab and come back; the UI re-attaches to the in-flight job and picks up where it left off.
5. **Failures** — if any lesson fails, it shows a **TENTAR NOVAMENTE** chip that re-generates only that lesson (completed lessons are untouched).
6. **Done** — once generation finishes, the new lessons appear in the library under their level. Hit **Nova conversa** to start over.

Out-of-scope requests (grammar questions, translations, "write me a poem") are redirected by a built-in guardrail.

### Practising a lesson

Each lesson is a scripted dialogue between two characters. You play one character; the app plays the other.

```
1. App presents a line  →  "So Todd, where are you from?"
2. You review            →  View translation, listen to audio (reference playback available)
3. You respond           →  Record your line
4. AI analyzes           →  Speaking Tutor evaluates your audio
5. Feedback delivered    →  Summary in Brazilian Portuguese
   ✅ Correct → Proceed to next exchange
   ❌ Incorrect → Retry until successful
```

## Screenshots

After running `make start` and opening `http://localhost:3000`, you'll see:

### 1. Home Page — Level Selection

Choose between Beginner, Intermediate, and Advanced difficulty levels. New users see a CTA pointing at the Content Producer:

![Home Page - Level Selection](docs/screenshots/01-home-level-selection.png)

### 2. Lessons List

Each level contains the lessons you've generated:

![Lessons List](docs/screenshots/02-lessons-list.png)

### 3. Lesson Player

Interactive dialogue with audio playback, translation, and voice recording:

![Lesson Player](docs/screenshots/03-lesson-player.png)

## Features

- **Three difficulty levels** — Beginner, Intermediate, and Advanced
- **Interactive Content Producer** — A conversational agent that proposes a lesson plan for your approval and only generates after you confirm
- **On-demand generation** — Lessons are no longer pre-seeded; the app boots instantly and the catalogue is built by you
- **Plan mode** — Every generation shows a plan card (count, level, theme, characters, time) you can edit or confirm
- **Real-time progress** — Per-lesson status (pending → generating → completed/failed) streamed over SSE
- **Partial-failure recovery** — Failed lessons show a retry chip; completed lessons are never re-run
- **Guardrails** — Out-of-scope requests (grammar Q&A, translation, poems) are redirected back to lesson creation
- **Speaking Analysis & Feedback** — A Speaking Tutor Agent transcribes audio via gpt-4o-mini-transcribe and evaluates pronunciation/vocabulary
- **AI-Generated Audio** — All listening clips use OpenAI text-to-speech (gpt-4o-mini-tts, voice: marin)
- **Reference Playback** — Listen to AI-generated audio for any exchange to hear correct pronunciation
- **Translation Support** — Brazilian Portuguese translation available for every dialogue line
- **No account required** — Start practising immediately
- **Progress tracking** — Lesson completion tracked via local session

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [OpenAI API key](https://platform.openai.com/api-keys)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/araujgom/cariockko.git
cd cariockko

# 2. Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
# Optional: Set OPENAI_MODEL_CHAT to override the default model (gpt-4o-mini)

# 3. Start all services
make start
# or: docker compose up -d --build

# 4. Open http://localhost:3000 in your browser
# 5. Click the "Criar" tab (sparkles icon) and start a conversation
```

The app boots with an empty catalogue. The first time you open the **Criar Lições** tab the agent will walk you through creating your first batch of lessons.

### Verify Services

```bash
# Check all services are running
make status
# or: docker compose ps

# Check API health
curl http://localhost:3001/health/ready
```

### Mobile / Phone Access (Dev)

Browsers require a **secure context** (HTTPS, or `localhost`) for
`getUserMedia` to work. Plain HTTP on a LAN IP is silently blocked — so
testing the microphone from a phone needs a public HTTPS URL.

The simplest way is `make tunnel`, which uses
[localhost.run](https://localhost.run/) — a clientless SSH-based tunnel
that wraps `http://localhost:3000` in a public `https://*.lhr.life` URL.
No certs, no LAN IP, no firewall fiddling.

```bash
# 1. Start the stack (in one terminal)
make start

# 2. Open a tunnel (in another terminal)
make tunnel
# → Read the printed `https://<id>.lhr.life` URL
# → Open it on your phone — mic works because it's a real HTTPS origin
```

`make tunnel` runs `ssh -R 80:localhost:3000 localhost.run`. Press `Ctrl+C`
to close the tunnel; the local stack keeps running.

Plain `make start` (everything in Docker, HTTP on `localhost:3000`) is the
right choice when testing from the same machine — microphone works there
because `localhost` counts as a secure context.

## Make Commands

| Command | Description |
|---------|-------------|
| `make start` | Start all services (detached, with builds) |
| `make stop` | Stop all services (keep volumes) |
| `make destroy` | Stop all services, remove volumes and images (deletes all data) |
| `make restart` | Restart all services |
| `make logs` | Follow logs from all services |
| `make status` | Show status of all services |
| `make tunnel` | Expose the running stack over public HTTPS via localhost.run (for phone/mic testing) |
| `make help` | Show available commands |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  web (:3000) │───▶│  api (:3001) │───▶│  db (:5432)  │  │
│  │   Next.js    │    │   Express    │    │  PostgreSQL  │  │
│  │   (SSE-aware)│    │  + LangChain │    │              │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
│                             │                               │
│                             ▼                               │
│                     ┌──────────────┐                        │
│                     │ minio (:9000)│                        │
│                     │  S3 Storage  │                        │
│                     └──────────────┘                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     External Services                       │
│                                                             │
│  OpenAI API ──────────────────────────────────────────────  │
│  ├─ GPT-4o-mini (Content Producer chat + lesson content + speech evaluation) │
│  ├─ GPT-4o-mini-transcribe (speech-to-text)                │
│  └─ GPT-4o-mini-tts (text-to-speech audio generation)      │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Service | Technology | Port | Purpose |
|---------|-----------|------|---------|
| `web` | Next.js 15 + React 19 + Tailwind CSS 4 | 3000 | Frontend UI, SSE client |
| `api` | Express + LangChain + OpenAI | 3001 | Backend API, AI agents, SSE stream |
| `db` | PostgreSQL 15 | 5432 | Lessons, exchanges, progress, sessions, jobs |
| `minio` | MinIO (S3-compatible) | 9000/9001 | Audio file storage |

## API Reference

### Health Checks

```
GET /health          → { "status": "ok" }
GET /health/live     → { "status": "live" }   # container liveness
GET /health/ready    → { "status": "ready" }  # DB reachable
```

### Lessons

```
GET /api/lessons                    → List all lessons (optional: ?level=beginner)
GET /api/lessons/:id                → Get lesson with dialogue exchanges
```

**Response (list):**
```json
[
  {
    "id": "uuid",
    "title": "Meeting someone new",
    "level": "beginner",
    "created_at": "2025-01-01T00:00:00Z",
    "exchange_count": 10
  }
]
```

**Response (detail):**
```json
{
  "id": "uuid",
  "title": "Meeting someone new",
  "level": "beginner",
  "exchanges": [
    {
      "id": "uuid",
      "order_index": 0,
      "speaker": "app",
      "english_text": "Hello! My name is Aimee. What's your name?",
      "portuguese_translation": "Olá! Meu nome é Aimee. Qual é o seu nome?",
      "audio_url": "http://localhost:9000/audio/lessons/..."
    }
  ]
}
```

### Content Producer

```
POST /api/content-producer/chat
  body: { session_id, message }
  → { reply, plan?, guardrail? }

GET    /api/content-producer/session/:sessionId     → { session_id, messages[] }
DELETE /api/content-producer/session/:sessionId     → { ok: true }

POST /api/content-producer/generate
  body: { session_id, plan: { lessons: [{level, theme, count}], characters, estimatedMinutes } }
  → 202 { job_id, snapshot }

GET  /api/content-producer/jobs/recent?session_id=…  → { snapshot|null }
GET  /api/content-producer/jobs/:jobId               → JobSnapshot
GET  /api/content-producer/jobs/:jobId/events        → Server-Sent Events
POST /api/content-producer/jobs/:jobId/retry         → { lesson_index }
POST /api/content-producer/jobs/:jobId/cancel
```

**SSE event types:**
- `event: progress` → full `JobSnapshot` JSON
- `event: done` → `{ status: "completed" | "failed" | "cancelled" }`

**Plan payload:**
```json
{
  "lessons": [
    { "level": "beginner", "theme": "Ordering coffee", "count": 3 }
  ],
  "characters": { "app": "Aimee", "student": "Todd" },
  "estimatedMinutes": 5
}
```

The chat endpoint accepts `lesson_index` and `count` per level up to 20, and at most 60 lessons per generation (server-enforced). The chat endpoint is rate-limited at 30 messages / minute; the generate endpoint at 5 generations / 10 minutes per session.

### Speaking Tutor

```
POST /api/speaking-tutor
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | File | Yes | Audio recording (webm, mp3, wav, ogg, max 10MB) |
| `lesson_id` | String | Yes | Lesson UUID |
| `exchange_index` | Number | Yes | Current dialogue exchange index |
| `expected_text` | String | Yes | The English text the student should say |

**Response:**
```json
{
  "is_correct": true,
  "feedback_pt": "Muito bem! Sua pronúncia está ótima.",
  "transcription": "Hello, my name is Todd"
}
```

### Progress

```
POST /api/progress                  → Save lesson completion
GET  /api/progress/:session_id      → Get completed lessons for session
```

**Request (POST):**
```json
{
  "session_id": "local-storage-session-id",
  "lesson_id": "uuid",
  "completed": true
}
```

## Database Schema

```sql
-- Lessons (created on demand by the Content Producer)
lessons (id, title, level, created_at)
  level: 'beginner' | 'intermediate' | 'advanced'

-- Dialogue exchanges within lessons
dialogue_exchanges (id, lesson_id, order_index, speaker, english_text, portuguese_translation, audio_url, created_at)
  speaker: 'app' | 'student'

-- User progress tracking
user_progress (id, session_id, lesson_id, completed, completed_at, created_at)
  UNIQUE(session_id, lesson_id)

-- Content Producer conversation history (one row per browser session)
content_producer_sessions (id, session_id UNIQUE, messages JSONB, created_at, updated_at)

-- Generation job state (so the UI can recover after navigation)
lesson_generation_jobs (id, session_id, plan JSONB, status, progress JSONB, error, created_at, updated_at)
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for AI features |
| `OPENAI_MODEL_CHAT` | No | `gpt-4o-mini` | Chat model for content generation and speech evaluation |
| `GEN_CONCURRENCY` | No | `3` | Max lessons generated in parallel per job |
| `SEED_CONCURRENCY` | No | `3` | Max lessons generated in parallel during the manual `seed-lessons` script |
| `POSTGRES_DB` | No | `postgres` | PostgreSQL database name |
| `POSTGRES_PASSWORD` | No | `local-dev-password` | PostgreSQL database password |
| `MINIO_ROOT_USER` | No | `minioadmin` | MinIO access key |
| `MINIO_ROOT_PASSWORD` | No | `minioadmin` | MinIO secret key |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001` | API URL (client-side) |
| `API_INTERNAL_URL` | No | `http://api:3001` | API URL (server-side, Docker) |

### AI Models

| Capability | Model | Purpose |
|-----------|-------|---------|
| Content Producer chat | `gpt-4o-mini` | Conversational planning, guardrails, structured output |
| Lesson content | `gpt-4o-mini` | Creates lesson dialogues |
| Speech evaluation | `gpt-4o-mini` | Analyzes student recordings |
| Speech-to-Text | `gpt-4o-mini-transcribe` | Transcribes audio |
| Text-to-Speech | `gpt-4o-mini-tts` (voice: marin) | Generates listening audio |

## Project Structure

```
cariockko/
├── api/                                       # Backend API
│   ├── src/
│   │   ├── agents/
│   │   │   ├── content-producer.ts            # Legacy seed wrapper
│   │   │   ├── content-producer-chat.ts       # Conversational agent (plan + guardrails)
│   │   │   ├── lesson-generator.ts            # Pure lesson + audio generation primitives
│   │   │   └── speaking-tutor.ts              # Speech evaluation agent
│   │   ├── lib/
│   │   │   ├── db.ts                          # PostgreSQL connection pool
│   │   │   ├── storage.ts                     # MinIO/S3 client
│   │   │   ├── sse.ts                         # Server-Sent Events helper
│   │   │   ├── generation-queue.ts            # In-memory job runner with subscribers
│   │   │   └── rate-limit.ts                  # Token-bucket middleware
│   │   ├── routes/
│   │   │   ├── lessons.ts
│   │   │   ├── progress.ts
│   │   │   ├── speaking-tutor.ts
│   │   │   └── content-producer.ts            # /api/content-producer/*
│   │   ├── scripts/
│   │   │   └── seed-lessons.ts                # Standalone seed script (manual use)
│   │   ├── entrypoint.ts                      # App startup; recovers interrupted jobs
│   │   └── index.ts                           # Express server
│   ├── Dockerfile
│   └── package.json
├── web/                                       # Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                       # Home (level selection + empty CTA)
│   │   │   ├── create-lessons/page.tsx        # Content Producer page
│   │   │   ├── lessons/[level]/               # Lesson list by level
│   │   │   └── lesson/[id]/                   # Lesson player
│   │   ├── components/
│   │   │   ├── LessonPlayer.tsx
│   │   │   ├── Sidebar.tsx                    # Now includes "Criar" tab
│   │   │   └── ContentProducer/
│   │   │       └── ContentProducerChat.tsx    # Welcome / Chat / Plan / Progress state machine
│   │   └── lib/
│   │       ├── api.ts                         # Typed wrappers for all endpoints
│   │       ├── session.ts                     # Per-browser session ID (localStorage)
│   │       └── sse.ts                         # EventSource wrapper
│   ├── Dockerfile
│   └── package.json
├── db/                                        # Database initialization
│   ├── init.sql                               # Schema (additive: content_producer_sessions, lesson_generation_jobs)
│   └── init.sh
├── docs/
│   ├── DELETION_LOG.md
│   └── screenshots/
├── .product/
│   ├── ideation.md
│   └── improving-content-producer.md          # This feature's spec
├── docker-compose.yml                         # Service orchestration
├── Makefile                                   # Development commands
├── .env.example                               # Environment template
└── README.md
```

## Development

### Running Locally (without Docker)

```bash
# Terminal 1: Start PostgreSQL and MinIO
docker compose up db minio minio-init

# Terminal 2: Start API
cd api
cp ../.env.example .env
npm install
npm run dev

# Terminal 3: Start Web
cd web
npm install
npm run dev
```

### Tests

```bash
# API: vitest + supertest
cd api
npm test            # one-shot
npm run test:watch  # watch mode
npm run test:coverage

# Web: vitest + React Testing Library
cd web
npm test
npm run test:watch
npm run test:coverage
```

### Seeding Lessons Manually (Optional)

The app no longer auto-seeds. The catalogue is built by you via the Content Producer tab. If you want to bulk-populate the catalogue (e.g. for a demo), the script is still available:

```bash
# Via Docker
docker compose run --rm api npm run seed-lessons

# Locally
cd api
npm run seed-lessons
```

The script generates 20 lessons per level (60 total) using the same `lesson-generator.ts` primitives the interactive flow uses.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
