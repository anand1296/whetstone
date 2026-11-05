-- Usage log for admin AI tools (v2.6): lets the server enforce a daily cap and show usage.
CREATE TABLE ai_generations (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,                 -- 'answer'
  subject       TEXT NOT NULL DEFAULT '',      -- the question title it was for
  model         TEXT NOT NULL,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_generations_created_idx ON ai_generations (created_at DESC);
