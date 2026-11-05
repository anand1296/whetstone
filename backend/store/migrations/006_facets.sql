-- "Rounds" became "topics" in the UI, so the filter tags (frontend, react, ...) are now "facets".
ALTER TABLE sections RENAME COLUMN topics TO facets;
ALTER TABLE topic_ideas RENAME COLUMN topics TO facets;

-- Framework-agnostic topics shouldn't be tagged with a framework: the filter keeps topics
-- that carry no tag in a group (so a React-only engineer still sees Accessibility), and
-- these three cover every framework through :::react / :::angular / :::vue blocks.
UPDATE sections SET facets = ARRAY['frontend'] WHERE id IN ('performance', 'testing-quality', 'ai-frontend');
