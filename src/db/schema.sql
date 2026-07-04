CREATE TABLE IF NOT EXISTS books (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  author_name TEXT,
  category TEXT,
  status TEXT,
  word_count INTEGER,
  fan_count INTEGER,
  favorite_count INTEGER,
  recommendation_count INTEGER,
  leader_count INTEGER,
  qidiantu_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booklists (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  book_count INTEGER,
  follower_count INTEGER,
  qidiantu_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booklist_entries (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES books(id),
  booklist_id BIGINT NOT NULL REFERENCES booklists(id),
  included_at DATE,
  comment_text TEXT NOT NULL,
  hearts INTEGER,
  source_page INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (book_id, booklist_id, content_hash)
);

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS book_ai_summaries (
  book_id BIGINT PRIMARY KEY REFERENCES books(id),
  summary_text TEXT NOT NULL,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  controversies JSONB NOT NULL DEFAULT '[]'::jsonb,
  audience_fit JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booklist_entries_book_id ON booklist_entries (book_id);
CREATE INDEX IF NOT EXISTS idx_booklist_entries_booklist_id ON booklist_entries (booklist_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs (status);
