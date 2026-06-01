## Vision

Cariockko is an open-source English language-learning app designed specifically for the Brazilian community. Its focus is to give Brazilians a safe, judgment-free environment to practice listening and speaking English through interactive, AI-powered conversation exercises.

## Problem

- Only ~5% of Brazilians have any knowledge of English, with less than 1–5% considered fluent.
- Brazilians often face stigma and judgment from peers while learning a new language.
- Language courses tailored to the Brazilian community tend to be prohibitively expensive.
- International platforms generally assume basic English knowledge that most Brazilians don't have, creating a barrier to entry.

## Solution

Cariockko helps Brazilian students improve their English **listening** and **speaking** skills through role-play conversations. It takes inspiration from sites like [Elllo](https://www.elllo.org/grammar/A1-index.htm), but with a key difference: the student takes an active role by impersonating a character in each lesson.

### Lesson Flow

Each lesson is a scripted dialogue between two characters (e.g., Aimee and Todd). The student plays one character; the app plays the other. The interaction follows this loop:

1. **App presents a line** from the non-student character (e.g., "So Todd, where are you from?").
2. **Student reviews the line**: can view a Brazilian Portuguese translation and listen to an AI-generated audio clip of the English text.
3. **Student responds**: records an audio clip of the student-character's next line.
4. **AI analyzes the recording**: the Speaking Tutor Agent evaluates the audio against the expected line and lesson context.
5. **Feedback is delivered**: the student receives a summarized feedback message in Brazilian Portuguese.
   - If the response is correct, the student proceeds to the next exchange.
   - If the response is incorrect (mispronunciation, wrong words), the student must retry before advancing.

## User Experience

- **No account required to start**: students can begin a lesson immediately.
- **Level selection**: students choose from Beginner, Intermediate, or Advanced lessons.
- **Progress tracking**: lesson completion is tracked per student (via local storage or authenticated session).
- **Replayability**: students can revisit completed lessons to practice further.

## Technical Architecture

### Overview

Cariockko runs entirely locally via Docker. All infrastructure components are containerized and orchestrated with `docker-compose`. A single command spins up the full stack.

> **Note**: While the application runs locally, AI capabilities (GPT-5 mini, Whisper, TTS) require an internet connection and a valid OpenAI API key.

### Infrastructure (Dockerized)

| Component | Technology | Container |
|-----------|-----------|-----------|
| Frontend | Next.js (React) | `cariockko-web` |
| Backend / API | Node.js (LangGraph agents) | `cariockko-api` |
| Database + Auth | Self-hosted Supabase | `supabase` (multi-service) |

### Running Locally

```bash
# Clone and start the entire stack
docker-compose up

# Or seed lessons first, then start
docker-compose run --rm api seed-lessons
docker-compose up
```

### AI Models (OpenAI API)

| Capability | Model |
|-----------|-------|
| Text generation & analysis | `gpt-5-mini` |
| Speech-to-text transcription | `whisper-1` |
| Text-to-speech (audio clips) | OpenAI TTS |

### Agents

1. **Content Producer Agent** — Runs as a one-time seed script (via `docker-compose run api seed-lessons`). Generates structured lesson conversations (up to 10 message-exchanges each) across 3 levels, 3 lessons per level (9 lessons total). Output is stored in the Supabase database.
2. **Speaking Tutor Agent** — Runs on-demand when a student submits a recording. Receives the full lesson context, the expected line, and the student's audio. Transcribes the audio via `whisper-1`, compares against the expected content, and returns structured feedback in Brazilian Portuguese.

## Features

1. **Three difficulty levels** — Lessons are organized into Beginner, Intermediate, and Advanced. Each level contains at least 3 lessons.
2. **AI Content Generation** — A Content Producer Agent (LangGraph) seeds the database with lesson conversations before the app's first use. Each lesson contains up to 10 dialogue exchanges.
3. **Speaking Analysis & Feedback** — A Speaking Tutor Agent (LangGraph) analyzes student audio recordings, compares them to the expected dialogue, and returns summarized feedback in Brazilian Portuguese. Incorrect responses block progression until retried successfully.
4. **AI-Generated Audio** — All listening audio clips (the app-character lines) are generated via OpenAI text-to-speech.
5. **Translation Support** — Students can view a Brazilian Portuguese translation of any dialogue line on demand.
