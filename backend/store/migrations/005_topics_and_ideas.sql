-- Topic chips on rounds, and community topic ideas (v2.4).

ALTER TABLE sections ADD COLUMN topics TEXT[] NOT NULL DEFAULT '{}';

-- Backfill the shipped rounds so the chips work without a "Sync from repository".
UPDATE sections SET topics = CASE id
  WHEN 'javascript-internals'      THEN ARRAY['frontend', 'javascript']
  WHEN 'typescript'                THEN ARRAY['frontend', 'javascript', 'typescript']
  WHEN 'async-utilities'           THEN ARRAY['frontend', 'javascript']
  WHEN 'react-internals'           THEN ARRAY['frontend', 'react']
  WHEN 'component-api-design'      THEN ARRAY['frontend', 'react']
  WHEN 'machine-coding'            THEN ARRAY['frontend', 'javascript', 'react']
  WHEN 'browser-platform'          THEN ARRAY['frontend']
  WHEN 'performance'               THEN ARRAY['frontend', 'react']
  WHEN 'testing-quality'           THEN ARRAY['frontend', 'react']
  WHEN 'accessibility'             THEN ARRAY['frontend']
  WHEN 'security'                  THEN ARRAY['frontend']
  WHEN 'frontend-system-design'    THEN ARRAY['frontend']
  WHEN 'architecture-at-scale'     THEN ARRAY['frontend']
  WHEN 'ai-frontend'               THEN ARRAY['frontend', 'react']
  WHEN 'leadership-behavioral'     THEN ARRAY['frontend']
  ELSE topics END;

-- "Suggest a topic": a person proposes a new category (and optionally a few starter questions).
-- An admin reviews it; accepting creates a draft round + draft questions, so progress is
-- derived from the content itself (draft -> published) rather than a status someone must edit.
CREATE TABLE topic_ideas (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  topics      TEXT[] NOT NULL DEFAULT '{}',          -- suggested chips (ids from content/topics.json)
  details     TEXT NOT NULL DEFAULT '',              -- what it should cover / why it matters
  credit      BOOLEAN NOT NULL DEFAULT true,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  reviewer_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
  review_note TEXT NOT NULL DEFAULT '',
  section_id  TEXT,                                  -- the round created / chosen on accept
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX topic_ideas_status_idx ON topic_ideas (status, created_at DESC);
CREATE INDEX topic_ideas_user_idx ON topic_ideas (user_id, created_at DESC);

CREATE TABLE topic_idea_questions (
  id          BIGSERIAL PRIMARY KEY,
  idea_id     BIGINT NOT NULL REFERENCES topic_ideas (id) ON DELETE CASCADE,
  position    INT NOT NULL,
  title       TEXT NOT NULL,
  question_id TEXT                                   -- the draft question created on accept
);
CREATE INDEX topic_idea_questions_idea_idx ON topic_idea_questions (idea_id, position);
