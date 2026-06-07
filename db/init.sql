CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dialogue_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  speaker TEXT NOT NULL CHECK (speaker IN ('app', 'student')),
  english_text TEXT NOT NULL,
  portuguese_translation TEXT NOT NULL,
  audio_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lesson_id, order_index)
);

CREATE TABLE IF NOT EXISTS user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, lesson_id)
);

-- Content Producer conversation sessions. One row per browser session;
-- the actual chat turns live inside the `messages` JSONB array.
CREATE TABLE IF NOT EXISTS content_producer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tracks an in-flight (or recently-completed) generation job so the
-- UI can recover state after navigation and re-attach to the SSE stream.
CREATE TABLE IF NOT EXISTS lesson_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  plan JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dialogue_exchanges_lesson ON dialogue_exchanges(lesson_id, order_index);
CREATE INDEX idx_user_progress_session ON user_progress(session_id);
CREATE INDEX idx_lessons_level ON lessons(level);
CREATE UNIQUE INDEX IF NOT EXISTS lessons_title_lower_unique_idx ON lessons(LOWER(title));
CREATE INDEX idx_content_producer_sessions_session ON content_producer_sessions(session_id);
CREATE INDEX idx_lesson_generation_jobs_session ON lesson_generation_jobs(session_id, created_at DESC);
