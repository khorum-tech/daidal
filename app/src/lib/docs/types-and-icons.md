---
title: Types and icons
summary: The built-in types, your workspace's own, and giving one node its own icon.
order: 6
---

# Types and icons

Every icon in Daidal comes from one library, so diagrams look alike whoever draws them.

## Built-in types

The type picker groups the built-in types by category: Client, AI, Compute, Data, Messaging, Network, Transfer, External, Operations, Code and Annotation. Code holds the C4 lower levels: Component, Module, Class, Table and File. AI covers AI Agent, LLM, MCP Server, Agent Tool, Vector Store, Embeddings, Knowledge Base, Prompt, Guardrail and Evaluation.

## Kinds of diagram

Every diagram has a kind, which you set in the diagram's sheet (press its name in the header). The kind decides which types the **+ Add** menu offers first, under **Common**; every other type is still there below. Changing a kind loses nothing.

| Kind | What it shows | Common types |
|---|---|---|
| **Freeform** | Anything; no levels | Web App, Service, Database, Queue, Actor, External, Storage, Note |
| **C4 Context** | Level 1: people and software systems | Actor, System, External, Third-party API, Identity Provider, Payment Provider |
| **C4 Container** | Level 2: the apps and data stores inside one system | Web App, Mobile App, Service, Function, Database, Queue, Object Storage, External |
| **C4 Component** | Level 3: the parts inside one container | Component, Module, Database, Queue, External |
| **C4 Code** | Level 4: classes, functions, tables | Class, Function, Table, File |
| **Deployment** | Where things run | Cluster, Container, Load Balancer, Edge, CDN, DNS, Database |

**C4 Context, Container and Component diagrams draw in C4 notation.** A card shows its name, a C4 element line (`[Container: Kotlin]`, the subtitle standing for the technology; `[Person]`; `[External System]`) and its notes as a short description, up to three lines (a person or system with no notes shows its subtitle there instead). The fill says what it is: people and systems darkest, containers lighter, components lightest, and anything outside the system grey. A person (Actor) has a head; a data store (Database, Cache, Storage…) is a cylinder. The card grows to fit. C4 Code and the other kinds keep the usual cards, and icon-only presenting still shows icons.

The templates set a kind for you: **C4 Context**, **C4 Container**, **C4 Component** and **C4 Code** are those kinds, **Deployment topology** is Deployment, and a blank canvas or **Freeform** is Freeform.

## Your workspace's own types

For something the built-ins don't cover, add a type to the workspace:

1. On the home screen, press **Manage** by the workspace's name.
2. Under **Types**, press **+ Add a type**: a name (say *Billing Agent*), a category (an existing one, or a new one), and an icon from the library.
3. It shows in the type picker for every diagram in that workspace, for everyone in it.

A type named like a built-in one (say *Database*) changes how that type looks in this workspace only. Anyone in the workspace can add, edit or remove types. They travel with a workspace backup.

![A workspace's Manage sheet, with its own type Billing Agent listed under Types](/app/docs-images/workspace-sheet.png)


A diagram moved to another workspace keeps its types; one that workspace doesn't have draws as a cube.

## One node's icon

In a node's details, **Icon** picks any icon from the library for that node alone; **Use the type's** goes back. It's saved in the document as the node's `icon`.

![The icon picker in a node's details: a search box over a grid of icons](/app/docs-images/icon-picker.png)

