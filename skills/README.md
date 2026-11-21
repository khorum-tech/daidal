# Claude skills

Skills that teach Claude to work with Daidal. Each folder is one skill: a `SKILL.md` with what Claude reads first,
and the references, assets and examples it points to.

| Skill | What it does |
|---|---|
| [`daidal-diagram`](daidal-diagram/SKILL.md) | Draws a Daidal config inline in Claude, with the published core renderer (`@khorum/daidal-core`) loaded from an npm CDN. |

## Installing one

- **claude.ai and Claude Desktop:** zip the skill's folder (so the zip holds `daidal-diagram/SKILL.md`) and upload it
  under Skills in Claude's settings.
- **Claude Code:** copy the folder into `~/.claude/skills/` (for you) or `.claude/skills/` (for one project).

`daidal-diagram` draws in Claude's inline visuals, so it needs the core bundle published to npm at the version its
widget pins (`assets/widget.html`; `scripts/daidal-skill.test.mjs` keeps that in step with `packages/core`). Before
then the widget says it can't load the renderer and shows the config as text.

## Licence

Like the rest of the repository, the skills are fair source under the Functional Source License (FSL-1.1-ALv2); see
[LICENSE.md](../LICENSE.md).
