-- Changes per person per minute through a browser or OAuth sign-in, for the write limit in worker/src/limits.ts
-- (personal access tokens count theirs on access_tokens). One row per person, rewritten each minute; it holds no
-- content, only a count.
CREATE TABLE rate_windows (
  email         TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  window_writes INTEGER NOT NULL
);
