-- Personal access tokens: how an MCP client or a script acts for a person without a browser sign-in. Only a
-- hash of each token is kept. `workspaces` is a JSON array of the workspace ids it may reach, or '' for all.
-- `window_start` and `window_writes` count its writes in the current minute, for the rate limit.
CREATE TABLE access_tokens (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  hash          TEXT NOT NULL UNIQUE,
  scope         TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  workspaces    TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  window_start  INTEGER NOT NULL DEFAULT 0,
  window_writes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX access_tokens_by_email ON access_tokens (email);
