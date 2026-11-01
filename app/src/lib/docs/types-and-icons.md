---
title: Types and icons
summary: The built-in types, your workspace's own, and giving one node its own icon.
order: 6
---

# Types and icons

Every icon in Skope comes from one library, so diagrams look alike whoever draws them.

## Built-in types

The type picker groups the built-in types by category: Client, AI, Compute, Data, Messaging, Network, Transfer, External, Operations and Annotation. AI covers AI Agent, LLM, MCP Server, Agent Tool, Vector Store, Embeddings, Knowledge Base, Prompt, Guardrail and Evaluation.

## Your workspace's own types

For something the built-ins don't cover, add a type to the workspace:

1. On the home screen, press **Manage** by the workspace's name.
2. Under **Types**, press **+ Add a type**: a name (say *Billing Agent*), a category (an existing one, or a new one), and an icon from the library.
3. It shows in the type picker for every diagram in that workspace, for everyone in it.

A type named like a built-in one (say *Database*) changes how that type looks in this workspace only. Anyone in the workspace can add, edit or remove types. They travel with a workspace backup.

A diagram moved to another workspace keeps its types; one that workspace doesn't have draws as a cube.

## One node's icon

In a node's details, **Icon** picks any icon from the library for that node alone; **Use the type's** goes back. It's saved in the document as the node's `icon`.
