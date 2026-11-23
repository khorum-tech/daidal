import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import { ToolError, TOOLS } from "../src/mcp/tools";
import { api, doc, type Signer } from "./helpers";
import { makeSigner } from "./tokens";
import { readConfig } from "@khorum/daidal-core/config";
import { EVERY_FIELD } from "@khorum/daidal-core/fixtures";
import type { DocNode } from "@khorum/daidal-core/types";

let signer: Signer;
let call: ReturnType<typeof api>;

beforeAll(async () => {
  signer = await makeSigner();
  call = api(signer);
});

/** A raw request to /mcp with [auth] headers. */
async function raw(init: RequestInit & { auth?: Record<string, string> }) {
  const headers = new Headers({ "content-type": "application/json", ...init.auth });
  return handleRequest(new Request("https://skope.khorum-oss.org/mcp", { ...init, headers }), env, signer.getKeys);
}

/** An MCP client with a personal access token for [email]. */
async function client(email: string, scope: "read" | "write" = "write") {
  const { body } = await call.post(email, "/api/me/tokens", { name: "mcp test", scope });
  const auth = { authorization: `Bearer ${body.token}` };
  let id = 0;
  const rpc = async (method: string, params?: unknown) => {
    const res = await raw({ method: "POST", auth, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
    return (await res.json()) as { result?: any; error?: { code: number; message: string } };
  };
  /** A tool's output, or its error text when it refused. */
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const { result, error } = await rpc("tools/call", { name, arguments: args });
    if (error) throw new Error(error.message);
    return result.isError ? { error: result.content[0].text as string } : result.structuredContent;
  };
  return { rpc, tool, auth };
}

const personal = (email: string) => `personal:${email}`;

describe("the MCP server", () => {
  it("wants a token or a sign-in, and refuses a malformed token, before reading anything", async () => {
    const none = await raw({ method: "POST", body: "{}" });
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe('Bearer realm="daidal"');
    expect((await raw({ method: "POST", body: "{}", auth: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("speaks JSON-RPC: initialize, tools/list, notifications, unknown methods, bad JSON, POST only", async () => {
    const { rpc, auth } = await client("mcp-proto@example.com");
    const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
    expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "daidal" }, capabilities: { tools: { listChanged: false } } });
    expect(init.result.instructions).toContain("list_workspaces");
    expect((await rpc("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion).toBe("2025-11-25");

    const tools = (await rpc("tools/list")).result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(["list_workspaces", "get_diagram", "apply_config", "add_node", "connect", "take_snapshot"]));
    expect(tools.find(t => t.name === "get_diagram")!.annotations.readOnlyHint).toBe(true);
    expect(tools.find(t => t.name === "add_node")!.annotations.readOnlyHint).toBe(false);

    const note = await raw({ method: "POST", auth, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(note.status).toBe(202);
    expect((await rpc("resources/list")).error!.code).toBe(-32601);
    expect((await rpc("tools/call", { name: "nope" })).error!.code).toBe(-32602);
    const bad = await raw({ method: "POST", auth, body: "{not json" });
    expect(bad.status).toBe(400);
    expect((await raw({ method: "GET", auth })).status).toBe(405);
    const batch = await raw({ method: "POST", auth, body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }]) });
    expect(await batch.json()).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
    const many = Array.from({ length: 21 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
    const tooMany = await raw({ method: "POST", auth, body: JSON.stringify(many) });
    expect(tooMany.status).toBe(400);
    expect(((await tooMany.json()) as { error: { message: string } }).error.message).toBe("a batch can hold at most 20 messages");
  });

  it("refuses a body over its size", async () => {
    const { auth } = await client("mcp-big@example.com");
    const res = await raw({ method: "POST", auth, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(1_200_000) } }) });
    expect(res.status).toBe(413);
  });

  it("lists workspaces, types and diagrams, and reads a diagram as an outline or a config", async () => {
    const email = "mcp-read@example.com";
    const { body: d } = await call.post(email, "/api/diagrams", { workspace: personal(email), doc: doc("checkout") });
    const { tool } = await client(email, "read");
    expect((await tool("list_workspaces")).workspaces).toEqual([expect.objectContaining({ id: personal(email), name: "Personal", personal: true })]);
    const types = (await tool("list_types")).categories as { category: string; types: string[] }[];
    expect(types.find(c => c.category === "AI")!.types).toContain("MCP Server");

    const listed = await tool("list_diagrams", { workspace: "Personal" });
    expect(listed.diagrams).toEqual([expect.objectContaining({ id: d.id, name: "checkout", nodes: 1, connections: 0 })]);

    const out = await tool("get_diagram", { diagram: "checkout" });
    expect(out).toMatchObject({ id: d.id, name: "checkout", nodes: [{ id: "gw", name: "Gateway", type: "Service", tags: ["api"], x: 10, y: 20 }], views: [{ name: "Full system", tags: ["api"] }] });
    expect((await tool("get_diagram", { diagram: d.id, format: "yaml" })).config).toContain("name: Gateway");
    expect((await tool("get_diagram", { diagram: "nope" })).error).toContain("no diagram");
    expect((await tool("list_snapshots", { diagram: d.id })).snapshots).toEqual([]);
  });

  it("adds, changes, connects, groups, tags and removes, as the owner, saving each time", async () => {
    const email = "mcp-write@example.com";
    const { tool } = await client(email);
    const made = await tool("create_diagram", { workspace: personal(email), name: "agents" });
    expect(made).toMatchObject({ did: "created", nodes: 0 });
    const d = made.diagram;

    expect((await tool("add_node", { diagram: d, name: "Billing Agent", type: "AI Agent", tags: ["AI"] })).node).toBeTruthy();
    await tool("add_node", { diagram: "agents", name: "Tools", type: "MCP Server", near: "Billing Agent" });
    expect(await tool("connect", { diagram: d, from: "Billing Agent", to: "Tools", label: "calls", line: "dashed" })).toMatchObject({ connection: 0, connections: 1 });
    await tool("update_node", { diagram: d, node: "Tools", subtitle: "Stripe, ledger", icon: "plugs", x: 600, y: 200 });
    await tool("add_container", { diagram: d, label: "Payments", around: ["Billing Agent", "Tools"] });
    await tool("tag_nodes", { diagram: d, tag: "Public", nodes: ["Tools"], group: "Exposure" });
    await tool("save_view", { diagram: d, name: "Just AI", tags: ["AI"] });

    const out = await tool("get_diagram", { diagram: d });
    const agent = out.nodes.find((n: { name: string }) => n.name === "Billing Agent");
    const tools = out.nodes.find((n: { name: string }) => n.name === "Tools");
    expect(agent).toMatchObject({ type: "AI Agent", tags: ["ai"] });
    expect(tools).toMatchObject({ type: "MCP Server", subtitle: "Stripe, ledger", icon: "plugs", x: 600, y: 200, tags: ["public"] });
    expect(out.connections).toEqual([{ index: 0, from: agent.id, to: tools.id, label: "calls" }]);
    const box = out.containers[0];
    expect(box.label).toBe("Payments");
    expect(box.x).toBeLessThan(Math.min(agent.x, tools.x));
    expect(box.x + box.w).toBeGreaterThan(tools.x + 190);
    expect(out.tags).toEqual(expect.arrayContaining([{ key: "ai", label: "AI", group: "Unlabelled" }, { key: "public", label: "Public", group: "Exposure" }]));
    expect(out.views).toEqual([{ name: "Just AI", tags: ["ai"] }]);

    await tool("update_connection", { diagram: d, from: "Billing Agent", to: "Tools", direction: "both" });
    await tool("remove_connection", { diagram: d, index: 0 });
    await tool("remove_node", { diagram: d, node: "Tools" });
    const after = await tool("get_diagram", { diagram: d });
    expect(after.nodes.map((n: { name: string }) => n.name)).toEqual(["Billing Agent"]);
    expect(after.connections).toEqual([]);
    expect((await tool("update_node", { diagram: d, node: "Ghost" })).error).toContain('no node "Ghost"');
    expect((await tool("update_node", { diagram: d, node: "Billing Agent", icon: "trash" })).error).toContain("no icon");
  });

  it("gives a code block functions, as signatures or entries, and lists them as signatures", async () => {
    const email = "mcp-functions@example.com";
    const { tool } = await client(email);
    const d = (await tool("create_diagram", { workspace: personal(email), name: "code" })).diagram;
    await tool("add_node", { diagram: d, name: "BalanceChecker", type: "Class", members: ["id: BatchId"], functions: ["check(batch: Batch): Verdict"] });
    let out = await tool("get_diagram", { diagram: d });
    expect(out.nodes[0]).toMatchObject({ name: "BalanceChecker", members: ["id: BatchId"], functions: ["check(batch: Batch) → Verdict"] });
    await tool("update_node", { diagram: d, node: "BalanceChecker", functions: [{ name: "explain", params: [{ name: "batch", type: "Batch" }], returns: "List<Imbalance>", notes: "Which currencies are out." }] });
    out = await tool("get_diagram", { diagram: d });
    expect(out.nodes[0].functions).toEqual(["explain(batch: Batch) → List<Imbalance>"]);
    // In a language, the outline writes them as that language does.
    await tool("update_node", { diagram: d, node: "BalanceChecker", language: "java" });
    out = await tool("get_diagram", { diagram: d });
    expect(out.nodes[0]).toMatchObject({ language: "java", functions: ["List<Imbalance> explain(Batch batch)"] });
    await tool("update_node", { diagram: d, node: "BalanceChecker", language: "" });
    expect((await tool("get_diagram", { diagram: d })).nodes[0]).not.toHaveProperty("language");
    const yaml = (await tool("get_diagram", { diagram: d, format: "yaml" })).config;
    expect(yaml).toContain("functions:\n      - name: explain\n        params:\n          - name: batch\n            type: Batch\n        returns: \"List<Imbalance>\"\n        notes: Which currencies are out.");
    await tool("update_node", { diagram: d, node: "BalanceChecker", functions: [] });
    expect((await tool("get_diagram", { diagram: d })).nodes[0]).not.toHaveProperty("functions");
  });

  it("gives a table its columns, as lines or entries, keeps an id on each, and lists them as lines", async () => {
    const email = "mcp-columns@example.com";
    const { tool } = await client(email);
    const made = { id: (await tool("create_diagram", { workspace: personal(email), name: "tables" })).diagram };
    await tool("add_node", { diagram: made.id, name: "orders", type: "Table", columns: ["PK id: uuid", { name: "customer_id", type: "uuid", key: "fk" }] });
    let out = await tool("get_diagram", { diagram: made.id });
    expect(out.nodes[0]).toMatchObject({ name: "orders", type: "Table", columns: ["PK id: uuid", "FK customer_id: uuid"] });
    let yaml = (await tool("get_diagram", { diagram: made.id, format: "yaml" })).config as string;
    expect(yaml).toContain("columns:\n      - id: c1\n        name: id\n        type: uuid\n        key: pk\n      - id: c2\n        name: customer_id");
    await tool("update_node", { diagram: made.id, node: "orders", columns: [{ id: "c2", name: "buyer_id", type: "uuid", key: "fk" }, "placed_at: timestamptz"] });
    out = await tool("get_diagram", { diagram: made.id });
    expect(out.nodes[0].columns).toEqual(["FK buyer_id: uuid", "placed_at: timestamptz"]);
    yaml = (await tool("get_diagram", { diagram: made.id, format: "yaml" })).config as string;
    expect(yaml).toContain("- id: c2\n        name: buyer_id");
    await tool("update_node", { diagram: made.id, node: "orders", columns: [] });
    expect((await tool("get_diagram", { diagram: made.id })).nodes[0]).not.toHaveProperty("columns");
  });

  // What get_diagram's outline lists of each node field: its key there, or why only the YAML carries it. A field added
  // to DocNode fails the typecheck here until it has a line (see packages/core/src/contract.test.ts for the rest).
  const OUTLINE: { [K in keyof DocNode]-?: string | { yamlOnly: string } } = {
    id: "id",
    name: "name",
    type: "type",
    icon: "icon",
    subtitle: "subtitle",
    flags: { yamlOnly: "a drawing detail" },
    tags: "tags",
    layout: "x",
    notes: { yamlOnly: "long text, kept out of the outline" },
    members: "members",
    functions: "functions",
    language: "language",
    path: "path",
    columns: "columns",
    links: "zoomsInto",
    ref: { yamlOnly: "ties the node to another diagram" },
  };

  it("carries every field of the format through get_diagram, as the outline says and in full as YAML", async () => {
    const email = "mcp-contract@example.com";
    const { body: d } = await call.post(email, "/api/diagrams", { workspace: personal(email), doc: EVERY_FIELD });
    const { tool } = await client(email, "read");
    const node = (await tool("get_diagram", { diagram: d.id })).nodes[0];
    for (const [field, key] of Object.entries(OUTLINE)) if (typeof key === "string") expect(node, `outline lists ${field} as ${key}`).toHaveProperty(key);
    const yaml = (await tool("get_diagram", { diagram: d.id, format: "yaml" })).config as string;
    expect(readConfig(yaml, EVERY_FIELD, "replace").doc).toEqual(EVERY_FIELD);
  });

  it("keeps every field of the format through a backup and its import", async () => {
    const email = "mcp-contract-backup@example.com";
    await call.post(email, "/api/diagrams", { workspace: personal(email), doc: EVERY_FIELD });
    const { body } = await call.get(email, "/api/me/export");
    const saved = body.backup.workspaces.flatMap((w: { diagrams: { doc: unknown }[] }) => w.diagrams.map(x => x.doc));
    expect(saved).toEqual([EVERY_FIELD]);
  });

  it("applies a config by merge or replace, says what it did, and explains a config it can't read", async () => {
    const email = "mcp-config@example.com";
    const { body: d } = await call.post(email, "/api/diagrams", { workspace: personal(email), doc: doc("cfg") });
    const { tool } = await client(email);
    const merged = await tool("apply_config", { diagram: d.id, config: "nodes:\n  - { id: db, name: Orders DB, type: database }\nedges:\n  - { from: gw, to: db }\n" });
    expect(merged).toMatchObject({ did: "merged", nodes: 2, connections: 1, summary: "Merged in: 1 new node, 1 new connection" });
    expect((await tool("apply_config", { diagram: d.id, config: "views: []\n" })).error).toBe("the config can't be read: No nodes found: add a “nodes:” list");
    const replaced = await tool("apply_config", { diagram: d.id, mode: "replace", config: '{"nodes":[{"id":"only","name":"Only"}]}' });
    expect(replaced).toMatchObject({ did: "replaced", nodes: 1, connections: 0 });
  });

  it("takes a config's connections, containers and plain x and y, and names types the workspace doesn't offer", async () => {
    const email = "mcp-config-words@example.com";
    const { body: d } = await call.post(email, "/api/diagrams", { workspace: personal(email), doc: doc("words") });
    const { tool } = await client(email);
    const merged = await tool("apply_config", {
      diagram: d.id,
      config: "nodes:\n  - { id: ledger, name: Ledger, type: database, x: 900, y: 420 }\n  - { id: q, name: Q, type: quantum-thing }\nconnections:\n  - { from: gw, to: ledger }\n",
    });
    expect(merged).toMatchObject({ nodes: 3, connections: 1 });
    expect(merged.summary).toBe(
      "Merged in: 2 new nodes, 1 new connection. Types this workspace doesn't offer (shown with a plain icon): Q (quantum-thing); list_types shows the ones it does",
    );
    const out = await tool("get_diagram", { diagram: d.id });
    expect(out.nodes.find((n: { id: string }) => n.id === "ledger")).toMatchObject({ x: 900, y: 420 });
    expect((await tool("apply_config", { diagram: d.id, config: "nodes:\n  - { id: ledger, subtitle: books }\n" })).summary).toBe("Merged in: 1 updated");
  });

  it("gives nodes only the types the workspace offers, its own included", async () => {
    const email = "mcp-types@example.com";
    const ws = personal(email);
    await call.put(email, `/api/workspaces/${encodeURIComponent(ws)}/types/billing-bot`, { name: "Billing Bot", category: "AI", icon: "robot" });
    const { tool } = await client(email);
    const d = (await tool("create_diagram", { workspace: ws, name: "typed" })).diagram;
    expect((await tool("add_node", { diagram: d, name: "Q", type: "Quantum Thing" })).error).toBe('no node type "Quantum Thing" in this workspace. list_types shows them all');
    expect((await tool("add_node", { diagram: d, name: "A", type: "agent" })).error).toMatch(/^no node type "agent" in this workspace; near it: .*AI Agent.*list_types shows them all$/);
    await tool("add_node", { diagram: d, name: "Bot", type: "billing bot" });
    await tool("add_node", { diagram: d, name: "Agent", type: "ai agent" });
    expect((await tool("update_node", { diagram: d, node: "Agent", type: "Nope" })).error).toContain('no node type "Nope"');
    await tool("update_node", { diagram: d, node: "Agent", type: "mcp server" });
    const out = await tool("get_diagram", { diagram: d });
    expect(out.nodes.map((n: { name: string; type: string }) => [n.name, n.type])).toEqual([["Bot", "Billing Bot"], ["Agent", "MCP Server"]]);
  });

  it("links a node to another diagram to zoom into, and refuses one the person can't see", async () => {
    const email = "mcp-zoom@example.com";
    const { tool } = await client(email);
    const top = await tool("create_diagram", { workspace: personal(email), name: "top", config: "nodes:\n  - { id: api, name: API }\n" });
    const parts = await tool("create_diagram", { workspace: personal(email), name: "api parts", kind: "c4-component" });
    await tool("update_node", { diagram: top.diagram, node: "API", links: [{ url: "example.com/runbook" }, { diagram: "api parts", view: "All" }] });
    const node = (await tool("get_diagram", { diagram: top.diagram })).nodes[0];
    expect(node.zoomsInto).toEqual([{ diagram: parts.diagram, view: "All" }]);
    const { body: theirs } = await call.post("mcp-stranger@example.com", "/api/diagrams", { workspace: personal("mcp-stranger@example.com"), doc: doc("hidden") });
    expect((await tool("update_node", { diagram: top.diagram, node: "API", links: [{ diagram: theirs.id }] })).error).toBeTruthy();
    expect((await tool("update_node", { diagram: top.diagram, node: "API", links: [{ label: "nothing" }] })).error).toContain("needs a url");
  });

  it("creates from a config or a template, and takes a snapshot", async () => {
    const email = "mcp-create@example.com";
    const { tool } = await client(email);
    const fromConfig = await tool("create_diagram", { workspace: personal(email), name: "from config", config: "nodes:\n  - { id: a, name: A }\n  - { id: b, name: B }\n" });
    expect(fromConfig.nodes).toBe(2);
    const fromTemplate = await tool("create_diagram", { workspace: personal(email), name: "c4", template: "C4 Container", examples: true });
    expect(fromTemplate.nodes).toBeGreaterThan(0);
    // A template sets a kind; kind overrides it, and the outline names it by its id.
    expect((await tool("get_diagram", { diagram: fromTemplate.diagram })).kind).toBe("c4-container");
    const component = await tool("create_diagram", { workspace: personal(email), name: "parts", template: "C4 Container", kind: "c4-component" });
    expect((await tool("get_diagram", { diagram: component.diagram })).kind).toBe("c4-component");
    const snap = await tool("take_snapshot", { diagram: fromConfig.diagram, label: "before the AI" });
    expect(snap.label).toBe("before the AI");
    expect((await tool("list_snapshots", { diagram: fromConfig.diagram })).snapshots).toEqual([expect.objectContaining({ label: "before the AI", by: "you" })]);
  });

  it("can't write with a read token, nor change a diagram its person doesn't own", async () => {
    const owner = "mcp-owner@example.com";
    const { body: ws } = await call.post(owner, "/api/workspaces", { name: "Shared" });
    await call.post(owner, `/api/workspaces/${ws.id}/members`, { email: "mcp-member@example.com" });
    const { body: d } = await call.post(owner, "/api/diagrams", { workspace: ws.id, doc: doc("theirs") });

    const reader = await client(owner, "read");
    expect((await reader.tool("add_node", { diagram: d.id, name: "X" })).error).toBe("this access token can only read");
    const member = await client("mcp-member@example.com");
    expect((await member.tool("get_diagram", { diagram: d.id })).name).toBe("theirs");
    expect((await member.tool("add_node", { diagram: d.id, name: "X" })).error).toContain("owner");
  });

  it("never hands anyone's email to the AI: owners and authors are you or another member", async () => {
    const owner = "mcp-private-owner@example.com";
    const member = "mcp-private-member@example.com";
    const { body: ws } = await call.post(owner, "/api/workspaces", { name: "Quiet" });
    await call.post(owner, `/api/workspaces/${ws.id}/members`, { email: member });
    await call.post(owner, `/api/workspaces/${ws.id}/members`, { email: "mcp-private-third@example.com" });
    const { body: d } = await call.post(owner, "/api/diagrams", { workspace: ws.id, doc: doc("quiet") });
    await call.post(owner, `/api/diagrams/${d.id}/snapshots`, { label: "v1", doc: doc("quiet") });

    const { tool } = await client(member);
    const outputs = [
      await tool("list_workspaces"),
      await tool("list_diagrams", { workspace: ws.id }),
      await tool("get_diagram", { diagram: d.id }),
      await tool("list_snapshots", { diagram: d.id }),
    ];
    expect(JSON.stringify(outputs)).not.toMatch(/mcp-private-(owner|third)@/);
    expect(outputs[0].workspaces.find((w: { id: string }) => w.id === ws.id)).toEqual({ id: ws.id, name: "Quiet", personal: false, owner: "another member", types: [] });
    expect(outputs[1].diagrams[0].owner).toBe("another member");
    expect(outputs[2].owner).toBe("another member");
    expect(outputs[3].snapshots[0].by).toBe("another member");
    const mine = (await client(owner)).tool;
    expect((await mine("list_workspaces")).workspaces.find((w: { id: string }) => w.id === ws.id)).toMatchObject({ owner: "you", members: 3 });
  });

  it("re-applies its change once when someone saved in between, and gives up after that", async () => {
    const stale = { id: "d1", workspaceId: "w", ownerEmail: "a@x.io", name: "race", rev: 1, doc: doc("race"), updatedAt: 0 };
    const current = { ...stale, rev: 2, doc: { ...doc("race"), nodes: [...doc("race").nodes, { id: "theirs", name: "Theirs", type: "service" }] } };
    const puts: { rev: number; names: string[] }[] = [];
    let conflicts = 1;
    const fake = async (method: string, path: string, sent?: unknown) => {
      if (path === "/api/workspaces") return [{ id: "w", types: [] }];
      if (method === "GET") return stale;
      const body = sent as { rev: number; doc: { nodes: { name: string }[] } };
      puts.push({ rev: body.rev, names: body.doc.nodes.map(n => n.name) });
      if (conflicts-- > 0) throw new ToolError("the diagram changed since you loaded it", 409, current as never);
      return { ...current, rev: body.rev + 1, doc: body.doc };
    };
    const addNode = TOOLS.find(t => t.name === "add_node")!;
    const out = await addNode.run({ diagram: "d1", name: "Mine" }, fake);
    expect(puts).toEqual([
      { rev: 1, names: ["Gateway", "Mine"] },
      { rev: 2, names: ["Gateway", "Theirs", "Mine"] },
    ]);
    expect(out).toMatchObject({ rev: 3, nodes: 3 });

    conflicts = 2;
    puts.length = 0;
    await expect(addNode.run({ diagram: "d1", name: "Mine" }, fake)).rejects.toThrow("changed since you loaded it");
    expect(puts).toHaveLength(2);
  });
});
