-- Adds the "junior" level (v2.6). Questions and submissions may now target junior engineers.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_level_check;
ALTER TABLE questions ADD CONSTRAINT questions_level_check CHECK (level IN ('junior', 'senior', 'lead', 'principal'));
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_level_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_level_check CHECK (level IN ('junior', 'senior', 'lead', 'principal'));
