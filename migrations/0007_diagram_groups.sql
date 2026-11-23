-- The group a diagram is filed under in its workspace: a flat label the home page sorts cards under (a C4 set, a
-- service, a team). NULL means not in a group. It belongs to the workspace, not the document, so it is not in the
-- diagram's history and moving the diagram to another workspace clears it.
ALTER TABLE diagrams ADD COLUMN group_name TEXT;
CREATE INDEX diagrams_by_group ON diagrams(workspace_id, group_name);
