-- Daidal's own sign-in (worker/src/signin, docs/sign-in.md). Unused while only Cloudflare Access is on.
--
-- identities: which account each provider's person signs in to. A provider's subject is linked to an account the
-- first time it signs in, by its verified email, and keeps that account after.
CREATE TABLE identities (
  provider     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  email        TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_by_email ON identities (email);

-- sessions: one row per signed-in browser. Only the SHA-256 hash of the cookie's token is kept.
CREATE TABLE sessions (
  hash         TEXT PRIMARY KEY,
  email        TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_email ON sessions (email);

-- sign_in_states: a sign-in in progress, between leaving for the provider and coming back (ten minutes at most).
-- Keyed by the hash of its `state`; holds the PKCE verifier, the OpenID Connect nonce and where to go after.
CREATE TABLE sign_in_states (
  hash       TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  verifier   TEXT NOT NULL,
  nonce      TEXT NOT NULL,
  return_to  TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
