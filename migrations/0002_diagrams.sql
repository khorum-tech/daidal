-- Diagrams and their history (docs/superpowers/specs/2026-10-12-daidal-backend-design.md, "Data model").
-- `doc` is the JSON form of the .skope.json export, version 1; the server only checks its envelope.

CREATE TABLE diagrams (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_email        TEXT NOT NULL REFERENCES users(email),
  name               TEXT NOT NULL,
  doc                TEXT NOT NULL,
  rev                INTEGER NOT NULL DEFAULT 1,
  lead_id            TEXT REFERENCES diagrams(id) ON DELETE SET NULL,
  synced_snapshot_id TEXT,
  decided            TEXT NOT NULL DEFAULT '{}',
  paused             INTEGER NOT NULL DEFAULT 0,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX diagrams_by_workspace ON diagrams(workspace_id);
CREATE INDEX diagrams_by_lead ON diagrams(lead_id);

CREATE TABLE snapshots (
  id           TEXT PRIMARY KEY,
  diagram_id   TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  author_email TEXT NOT NULL,
  doc          TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX snapshots_by_diagram ON snapshots(diagram_id, created_at);

CREATE INDEX workspace_members_by_email ON workspace_members(email);
