-- A workspace's own node types: a name, the type picker category it sits in, and an icon from the app's library
-- (app/src/lib/diagram/icon-library.json). A type named like a built-in one changes that type's icon or category
-- in this workspace. Documents store types slugged, so the key is the slug of the name.
CREATE TABLE workspace_types (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  icon         TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, slug)
);
