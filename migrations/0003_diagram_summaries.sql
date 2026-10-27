-- What the home page shows of a diagram without its document: counts, tag colours, node names (for search) and
-- the boxes of a thumbnail, as JSON (worker/src/summary.ts). Worked out on every write; NULL until a diagram written
-- before this migration is next listed.
ALTER TABLE diagrams ADD COLUMN summary TEXT;
