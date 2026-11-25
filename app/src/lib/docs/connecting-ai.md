---
title: Connecting AI
summary: Let Claude, or another AI, read and edit your diagrams as you, over MCP.
order: 12
---

# Connecting AI

Daidal has an MCP server, so an AI assistant (Claude Code, Claude Desktop, claude.ai, or any MCP client) can list your diagrams, read them and change them, as you. It goes through the same rules as the app: it sees what you can see, and changes only diagrams you own.

## The address

| Where | MCP address |
|-------|-------------|
| Daidal | `{{DAIDAL_URL}}/mcp` |
| Stage | `{{DAIDAL_STAGE_URL}}/mcp` |
| On your computer (`wrangler dev`) | `{{DAIDAL_LOCAL_URL}}/mcp` |

Your initial → **AI access** shows the address for the Daidal you're on.

## Online: sign in as you

Online, an assistant signs in through the same Cloudflare Access sign-in you use, so it needs no token.

- **Claude Code:** run `claude mcp add --transport http daidal {{DAIDAL_URL}}/mcp`, then open `/mcp` in Claude Code and choose **Authenticate**. A browser window opens on the sign-in.
- **claude.ai, Claude Desktop and Claude mobile:** in Settings → Connectors, add a custom connector with the address, and sign in when it asks. A connector added on claude.ai is there on Desktop and mobile too.

This needs Managed OAuth turned on for Daidal's Access application, a one-time setup in Cloudflare (see `docs/mcp.md` in the repository). Until then, use a token.

## With a token: on your computer, or a script

1. Your initial → **AI access**.
2. Give the token a name (say *Claude on my laptop*), choose **Read** or **Read and write**, and, if you like, **Only some workspaces**.
3. **Create token**. The token is shown once: copy it. On your computer, the tab also gives you the Claude Code command to run:

```sh
claude mcp add --transport http daidal {{DAIDAL_LOCAL_URL}}/mcp --header "Authorization: Bearer skt_…"
```

`claude mcp list` should then say `daidal … ✓ Connected`. Revoke a token from the same tab any time; it stops working at once.

## What it can do

| Read | Change |
|------|--------|
| List your workspaces and the node types each offers | Create a diagram: blank, from a template, or from a config |
| List and search a workspace's diagrams | Apply a [config](/app/docs/config): merge it in, or replace the diagram |
| Read a diagram as an outline, or as its whole config | Add, change and remove [nodes](/app/docs/nodes) |
| List a diagram's snapshots | Connect nodes, and change or remove [connections](/app/docs/connections) |
| | Add [containers](/app/docs/containers) round nodes, and change them |
| | Tag nodes and save [views](/app/docs/tags-and-views) |
| | Take a [snapshot](/app/docs/history) |

A node an assistant adds is placed and named the way the editor would, and its types are the ones in your [type picker](/app/docs/types-and-icons), your workspace's own included.

## What it won't do

- Change a diagram you don't own, or see a workspace you're not in.
- Delete or move a diagram, change who's in a workspace, import or export backups, or touch your profile or tokens.
- With a **Read** token, change anything at all. With a token limited to some workspaces, see any other.
- Make more than 120 changes a minute through a token.
- Pass anyone's email to the AI: owners and authors come back as "you" or "another member".

If you have the diagram open while an assistant changes it, the strip above the canvas says it changed somewhere else, and offers to load the latest.

## Things to ask

- “List my Daidal diagrams in Platform team.”
- “Read checkout-platform and tell me what talks to the Orders DB.”
- “Take a snapshot of checkout-platform, then add a Redis cache between the Checkout API and the Orders DB.”
- “Draw our payments flow as a new diagram in Personal: storefront, checkout API, a payment provider and a ledger database.”
- “Tag everything that faces the internet as Public, and save a view called Public surface.”

Asking it to take a snapshot first gives you something to look back at, in [History](/app/docs/history).

## Drawing diagrams in the chat

The `daidal-diagram` skill teaches Claude to write a [config](/app/docs/config) and draw it inline in the chat, with the same renderer Daidal uses, so you can see a diagram before it goes anywhere and paste the config straight in. With this connector added too, it can draw a diagram from your workspace without opening the app. It lives in the repository under [`skills/daidal-diagram`]({{DAIDAL_REPO_URL}}/tree/main/skills/daidal-diagram); `skills/README.md` there says how to add it to Claude.

## When it doesn't work

| What you see | What it means |
|--------------|---------------|
| `401`, or “sign in … or send a personal access token” | No token and no sign-in: authenticate, or add a token |
| “not a valid access token” / “not valid or was revoked” | The token is mistyped or revoked: make a new one |
| “Unexpected content type: text/html” | Online sign-in isn't set up yet (Managed OAuth is off): use a token on your computer for now |
| “this access token can only read” | It's a Read token: make a Read and write one |
| “only the diagram's owner can change it” | The diagram belongs to someone else: copy it into a workspace of yours first |
| `429` | More than 120 changes a minute through a token: wait a moment |
