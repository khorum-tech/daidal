/**
 * The MCP server's tools. Each one reads or writes through the Worker's own API (see `Api`) as the client that
 * signed in, so ownership, token scope, workspace limits, the write rate limit, size limits and the save conflict
 * check all apply exactly as they do to the app. Edits use the app's own pure edit functions, so a node an AI adds
 * is placed and named the way the editor would. Outputs are compact.
 */
import { configText, ConfigError, readConfig } from "@khorum/daidal-core/config";
import {
  addBoundary,
  addEdge,
  addNode,
  addTag,
  addView,
  type EdgeChange,
  moveBoundary,
  moveNodes,
  type NodeChange,
  removeBoundary,
  removeEdge,
  removeNode,
  resizeBoundary,
  updateBoundary,
  updateEdge,
  updateNode,
  updateView,
} from "@khorum/daidal-core/edit";
import { catalogue, isNodeIcon, typeKey, type TypeCats } from "@khorum/daidal-core/icons";
import { KINDS, kindOf, type KindId } from "@khorum/daidal-core/kinds";
import { toScene } from "@khorum/daidal-core/model";
import { signature, toFunctions } from "@khorum/daidal-core/code";
import { fromTemplate, TEMPLATES } from "@khorum/daidal-core/templates";
import type { CustomType, DocEdge, DocNode, DaidalDoc } from "@khorum/daidal-core/types";

/** A call to this Worker's API as the MCP client: the parsed JSON, or a thrown ToolError saying why not. */
export type Api = (method: string, path: string, body?: unknown) => Promise<any>;

/** A refusal or mistake the model can act on; it comes back as a tool result marked as an error. */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    /** On a 409, the diagram as it is now. */
    public readonly current?: Diagram,
  ) {
    super(message);
  }
}

type Row = Record<string, any>;
interface Workspace {
  id: string;
  name: string;
  personal: boolean;
  ownerEmail: string;
  members: string[];
  types: CustomType[];
}
interface Diagram {
  id: string;
  workspaceId: string;
  ownerEmail: string;
  name: string;
  rev: number;
  doc: DaidalDoc;
  updatedAt: number;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  destructive?: boolean;
  inputSchema: Row;
  run: (args: Row, api: Api) => Promise<Row>;
}

// ---- small helpers ----

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const need = (args: Row, key: string): string => {
  const v = str(args[key]).trim();
  if (!v) throw new ToolError(`${key} is required`);
  return v;
};
const q = encodeURIComponent;
const same = (a: unknown, b: string) => str(a).trim().toLowerCase() === b.trim().toLowerCase();
/** "Name (id), Name (id)", for an error that lists what there is to choose from. */
const choices = (items: { name?: string; label?: string; id: string }[], none = "none") =>
  items.map(i => `${i.name ?? i.label ?? i.id} (${i.id})`).join(", ") || none;

/** The signed-in person's email: only to tell "you" from "another member", never to hand on. */
async function myEmail(api: Api): Promise<string> {
  return String(((await api("GET", "/api/me")) as Row).email ?? "");
}

/**
 * Who, as a tool answers it: "you", or "another member" (or "former member"). Emails stay out of tool output, since
 * whatever a tool returns goes to the AI client's model provider.
 */
const whoIs = (email: unknown, me: string) => {
  if (email === me) return "you";
  return email === "former member" ? "former member" : "another member";
};

async function workspaces(api: Api): Promise<Workspace[]> {
  return (await api("GET", "/api/workspaces")) as Workspace[];
}

async function workspaceOf(api: Api, param: unknown): Promise<Workspace> {
  const wanted = str(param).trim();
  const all = await workspaces(api);
  if (!wanted) throw new ToolError(`workspace is required; yours are ${choices(all)}`);
  const hit = all.find(w => w.id === wanted) ?? all.find(w => same(w.name, wanted));
  if (!hit) throw new ToolError(`no workspace ${JSON.stringify(wanted)} that you can reach; yours are ${choices(all)}`, 404);
  return hit;
}

/** A diagram by id, or by exact name across your workspaces (an error lists the matches when there are several). */
async function diagramOf(api: Api, param: unknown): Promise<Diagram> {
  const wanted = str(param).trim();
  if (!wanted) throw new ToolError("diagram is required (an id, or an exact name from list_diagrams)");
  try {
    return (await api("GET", `/api/diagrams/${q(wanted)}`)) as Diagram;
  } catch (e) {
    if (!(e instanceof ToolError) || e.status !== 404) throw e;
  }
  const lists = await Promise.all(
    (await workspaces(api)).map(async w => {
      const found = (await api("GET", `/api/diagrams?workspace=${q(w.id)}&q=${q(wanted)}&limit=50`)) as Row[];
      return found.filter(d => same(d.name, wanted)).map(d => ({ id: String(d.id), name: `in ${w.name}` }));
    }),
  );
  const hits = lists.flat();
  if (hits.length === 1) return (await api("GET", `/api/diagrams/${q(hits[0].id)}`)) as Diagram;
  if (hits.length > 1) throw new ToolError(`more than one diagram is called ${JSON.stringify(wanted)}: ${choices(hits)}; name it by id`);
  throw new ToolError(`no diagram ${JSON.stringify(wanted)} that you can reach; list_diagrams shows them`, 404);
}

/** The node types the diagram's workspace offers (the built-in ones and its own), by category. */
async function typesOf(api: Api, param: unknown): Promise<TypeCats> {
  const d = await diagramOf(api, param);
  const ws = (await workspaces(api)).find(w => w.id === d.workspaceId);
  return catalogue(ws?.types ?? []);
}

/** [given] as the display name of a type in [cats]; an error suggests near ones and points at list_types. */
function typeIn(cats: TypeCats, given: string): string {
  const key = typeKey(given);
  const labels = cats.flatMap(c => c.items.map(([label]) => label));
  const hit = labels.find(l => typeKey(l) === key);
  if (hit) return hit;
  const near = key ? labels.filter(l => typeKey(l).includes(key) || key.includes(typeKey(l))).slice(0, 6) : [];
  const hint = near.length ? `; near it: ${near.join(", ")}` : "";
  throw new ToolError(`no node type ${JSON.stringify(given)} in this workspace${hint}. list_types shows them all`);
}

/** Nodes [next] gives a type [cats] doesn't offer, that [before] didn't already have: "Name (type)". */
function strangers(before: DaidalDoc, next: DaidalDoc, cats: TypeCats): string[] {
  const had = new Map((before.nodes ?? []).map(n => [n.id, n.type]));
  const known = new Set(cats.flatMap(c => c.items.map(([label]) => typeKey(label))));
  return (next.nodes ?? []).filter(n => had.get(n.id) !== n.type && !known.has(typeKey(n.type ?? ""))).map(n => `${n.name} (${n.type})`);
}

/** Links as update_node takes them: a web page needs a url; a diagram to zoom into must be one this person can see. */
async function linksIn(api: Api, given: Row[]): Promise<NonNullable<DocNode["links"]>> {
  if (given.some(l => !str(l.diagram) && !str(l.url))) throw new ToolError("a link needs a url (a web page) or a diagram (to zoom into)");
  return Promise.all(
    given.map(async l => {
      const label = str(l.label) ? { label: str(l.label) } : {};
      if (!str(l.diagram)) return { ...label, url: str(l.url) };
      const target = await diagramOf(api, l.diagram);
      return { ...label, diagram: target.id, ...(str(l.view) ? { view: str(l.view) } : {}) };
    }),
  );
}

function nodeOf(doc: DaidalDoc, param: unknown, label = "node"): string {
  const wanted = str(param).trim();
  if (!wanted) throw new ToolError(`${label} is required (a node id, or an exact name)`);
  const nodes = doc.nodes ?? [];
  const hit = nodes.find(n => n.id === wanted) ?? nodes.find(n => same(n.name, wanted));
  if (!hit) throw new ToolError(`no ${label} ${JSON.stringify(wanted)}; this diagram has ${choices(nodes, "no nodes")}`, 404);
  return hit.id;
}

/** A node or a container: a connection can join either. */
function endOf(doc: DaidalDoc, param: unknown, label: string): string {
  const wanted = str(param).trim();
  const box = (doc.boundaries ?? []).find(b => b.id === wanted || same(b.label, wanted));
  return box ? box.id : nodeOf(doc, param, label);
}

function boxOf(doc: DaidalDoc, param: unknown): string {
  const wanted = str(param).trim();
  const boxes = doc.boundaries ?? [];
  const hit = boxes.find(b => b.id === wanted) ?? boxes.find(b => same(b.label, wanted));
  if (!hit) throw new ToolError(`no container ${JSON.stringify(wanted)}; this diagram has ${choices(boxes, "no containers")}`, 404);
  return hit.id;
}

/** A connection by its index, or by the ends it joins. */
function edgeOf(doc: DaidalDoc, args: Row): number {
  const edges = doc.edges ?? [];
  const index = num(args.index);
  if (index !== undefined) {
    if (!edges[index]) throw new ToolError(`no connection ${index}; this diagram has ${edges.length}`, 404);
    return index;
  }
  const from = endOf(doc, args.from, "from");
  const to = endOf(doc, args.to, "to");
  const at = edges.findIndex(e => e.from === from && e.to === to);
  if (at < 0) throw new ToolError(`no connection from ${from} to ${to}`, 404);
  return at;
}

/** Tag keys for [names] (keys or labels); a name no tag has becomes a new tag in [group]. */
function tagKeys(doc: DaidalDoc, names: string[], group?: string): { doc: DaidalDoc; keys: string[] } {
  let next = doc;
  const keys: string[] = [];
  for (const name of names) {
    const tags = next.tags ?? {};
    const found = tags[name] ? name : Object.keys(tags).find(k => same(tags[k].label, name));
    if (found) keys.push(found);
    else {
      const made = addTag(next, name, group);
      next = made.doc;
      keys.push(made.key);
    }
  }
  return { doc: next, keys };
}

/** The box around [ids] with room for a label. */
function around(doc: DaidalDoc, ids: string[]): { x: number; y: number; w: number; h: number } {
  const nodes = toScene(doc).nodes.filter(n => ids.includes(n.id));
  const x = Math.min(...nodes.map(n => n.x)) - 40;
  const y = Math.min(...nodes.map(n => n.y)) - 56;
  const r = Math.max(...nodes.map(n => n.x + n.w)) + 40;
  const b = Math.max(...nodes.map(n => n.y + n.h)) + 40;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(r - x), h: Math.round(b - y) };
}

function readText(text: string, current: DaidalDoc, mode: "replace" | "merge") {
  try {
    return readConfig(text, current, mode);
  } catch (e) {
    if (e instanceof ConfigError) {
      const where = e.line ? ` (line ${String(e.line)})` : "";
      throw new ToolError(`the config can't be read${where}: ${e.message}`);
    }
    throw e;
  }
}

// ---- outlines ----

function outline(d: Diagram, me: string, workspace?: string): Row {
  const doc = d.doc;
  return {
    id: d.id,
    name: d.name,
    ...(workspace ? { workspace } : { workspaceId: d.workspaceId }),
    owner: whoIs(d.ownerEmail, me),
    kind: kindOf(doc.diagram?.kind).id,
    nodes: toScene(doc).nodes.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      ...(n.sub ? { subtitle: n.sub } : {}),
      ...(n.members.length ? { members: n.members } : {}),
      ...(n.functions.length ? { functions: n.functions.map(signature) } : {}),
      ...(n.path ? { path: n.path } : {}),
      ...(n.tags.length ? { tags: n.tags } : {}),
      ...(n.ownIcon ? { icon: n.ownIcon } : {}),
      ...(n.zooms.length ? { zoomsInto: n.zooms } : {}),
      x: n.x,
      y: n.y,
    })),
    connections: (doc.edges ?? []).map((e, index) => ({ index, from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}) })),
    containers: (doc.boundaries ?? []).map(b => ({ id: b.id, label: b.label ?? "", ...b.layout })),
    tags: Object.entries(doc.tags ?? {}).map(([key, t]) => ({ key, label: t.label, group: t.group ?? "" })),
    views: (doc.views ?? []).map(v => ({ name: v.name, tags: v.tags })),
  };
}

const summary = (d: Diagram, what: string, extra: Row = {}): Row => ({
  diagram: d.id,
  name: d.name,
  rev: d.rev,
  did: what,
  nodes: (d.doc.nodes ?? []).length,
  connections: (d.doc.edges ?? []).length,
  ...extra,
});

// ---- saving ----

/**
 * Applies [change] to the diagram and saves it with the revision it was loaded at. If someone saved in between
 * (409), the same change is applied once more to what they saved.
 */
async function save(api: Api, param: unknown, change: (doc: DaidalDoc) => { doc: DaidalDoc; out?: Row }, what: string): Promise<Row> {
  let d = await diagramOf(api, param);
  for (let attempt = 0; ; attempt++) {
    const { doc, out } = change(d.doc);
    try {
      const saved = (await api("PUT", `/api/diagrams/${q(d.id)}`, { rev: d.rev, doc })) as Diagram;
      return summary(saved, what, out);
    } catch (e) {
      if (attempt > 0 || !(e instanceof ToolError) || e.status !== 409 || !e.current) throw e;
      d = e.current;
    }
  }
}

const just = (doc: DaidalDoc, out?: Row) => ({ doc, ...(out ? { out } : {}) });

// ---- schemas ----

/** A code block's functions, as add_node and update_node take them: replaces the node's functions. */
const FUNCTIONS = {
  type: "array",
  description: "What it can do, a line each on its card (a class's methods, a module's functions); replaces its functions. Each is a signature like \"check(batch: Batch): Verdict\", or { name, params: [{ name, type }], returns, notes }",
  items: {
    anyOf: [
      { type: "string" },
      {
        type: "object",
        properties: {
          name: { type: "string" },
          params: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object", properties: { name: { type: "string" }, type: { type: "string" } }, required: ["name"], additionalProperties: false }] } },
          returns: { type: "string" },
          notes: { type: "string", description: "What it does" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    ],
  },
};
const DIAGRAM = { type: "string", description: "The diagram: its id, or its exact name" };
const NODE = (what = "The node") => ({ type: "string", description: `${what}: its id, or its exact name` });
const LINE = { type: "string", enum: ["solid", "dashed", "dotted"] };
const DIRECTION = { type: "string", enum: ["forward", "back", "both", "none"], description: "Where the arrowheads go" };
const ROUTE = { type: "string", enum: ["curved", "straight", "angled"] };
const schema = (properties: Row, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

// ---- the tools ----

export const TOOLS: Tool[] = [
  {
    name: "list_workspaces",
    title: "List workspaces",
    description: "Your workspaces: id, name, whether it's your personal one, who owns it (you or another member), how many members it has (if it's yours) and its own node types.",
    readOnly: true,
    inputSchema: schema({}),
    run: async (_args, api) => ({
      workspaces: await Promise.all([workspaces(api), myEmail(api)]).then(([all, me]) =>
        all.map(w => ({
          id: w.id,
          name: w.name,
          personal: w.personal,
          owner: whoIs(w.ownerEmail, me),
          ...(w.ownerEmail === me ? { members: w.members.length } : {}),
          types: w.types.map(t => t.name),
        })),
      ),
    }),
  },
  {
    name: "list_types",
    title: "List node types",
    description: "The node types a workspace offers, by category: the built-in ones with the workspace's own merged in. Give a node any of these as its type.",
    readOnly: true,
    inputSchema: schema({ workspace: { type: "string", description: "A workspace id or name; left out, the built-in types" } }),
    run: async (args, api) => {
      const custom = str(args.workspace).trim() ? (await workspaceOf(api, args.workspace)).types : [];
      return { categories: catalogue(custom).map(c => ({ category: c.cat, types: c.items.map(([label]) => label) })) };
    },
  },
  {
    name: "list_diagrams",
    title: "List diagrams",
    description: "The diagrams in a workspace, newest first: id, name, owner, kind and size. query keeps those whose name, or a node's name, has it.",
    readOnly: true,
    inputSchema: schema(
      {
        workspace: { type: "string", description: "A workspace id or name" },
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        offset: { type: "integer", minimum: 0 },
      },
      ["workspace"],
    ),
    run: async (args, api) => {
      const w = await workspaceOf(api, args.workspace);
      const params = new URLSearchParams({ workspace: w.id, limit: String(Math.min(200, Math.max(1, num(args.limit) ?? 50))) });
      if (str(args.query).trim()) params.set("q", str(args.query).trim());
      if (num(args.offset)) params.set("offset", String(num(args.offset)));
      const [rows, me] = await Promise.all([api("GET", `/api/diagrams?${params}`) as Promise<Row[]>, myEmail(api)]);
      return {
        workspace: w.name,
        diagrams: rows.map(d => ({
          id: d.id,
          name: d.name,
          owner: whoIs(d.ownerEmail, me),
          kind: d.summary?.kind ?? "",
          nodes: d.summary?.nodes ?? 0,
          connections: d.summary?.edges ?? 0,
          updated: new Date(d.updatedAt).toISOString(),
          ...(d.leadId ? { follows: d.leadName ?? d.leadId } : {}),
        })),
      };
    },
  },
  {
    name: "get_diagram",
    title: "Read a diagram",
    description:
      "A diagram. outline (the default) is compact: nodes with id, name, type, tags and position; connections by index; containers; tags; views. yaml or json is the whole document as a Daidal config, the format apply_config takes.",
    readOnly: true,
    inputSchema: schema({ diagram: DIAGRAM, format: { type: "string", enum: ["outline", "yaml", "json"] } }, ["diagram"]),
    run: async (args, api) => {
      const d = await diagramOf(api, args.diagram);
      const format = str(args.format) || "outline";
      if (format === "yaml" || format === "json") return { id: d.id, name: d.name, rev: d.rev, format, config: configText(d.doc, format) };
      return outline(d, await myEmail(api));
    },
  },
  {
    name: "list_snapshots",
    title: "List snapshots",
    description: "A diagram's snapshots, oldest first: id, label, who took it and when.",
    readOnly: true,
    inputSchema: schema({ diagram: DIAGRAM }, ["diagram"]),
    run: async (args, api) => {
      const d = await diagramOf(api, args.diagram);
      const [snaps, me] = await Promise.all([api("GET", `/api/diagrams/${q(d.id)}/snapshots`) as Promise<Row[]>, myEmail(api)]);
      return { diagram: d.id, snapshots: snaps.map(s => ({ id: s.id, label: s.label, by: whoIs(s.authorEmail, me), at: new Date(s.createdAt).toISOString() })) };
    },
  },
  {
    name: "create_diagram",
    title: "Create a diagram",
    description: `A new diagram in a workspace: blank, from a Daidal config (YAML or JSON), or from a template (${TEMPLATES.map(t => t.name).join(", ")}). You become its owner. Its kind (${KINDS.map(k => k.id).join(", ")}) decides which types the app offers first; a template sets one, and kind overrides it.`,
    readOnly: false,
    inputSchema: schema(
      {
        workspace: { type: "string", description: "A workspace id or name" },
        name: { type: "string" },
        config: { type: "string", description: "A Daidal config, YAML or JSON" },
        template: { type: "string", enum: TEMPLATES.map(t => t.name) },
        examples: { type: "boolean", description: "With a template: keep its example nodes" },
        kind: { type: "string", enum: KINDS.map(k => k.id), description: "The kind of diagram; freeform if left out and no template sets one" },
      },
      ["workspace", "name"],
    ),
    run: async (args, api) => {
      const w = await workspaceOf(api, args.workspace);
      const name = need(args, "name");
      let doc: DaidalDoc = { version: 1, diagram: { name } };
      if (str(args.config).trim()) {
        const read = readText(str(args.config), doc, "replace").doc;
        doc = { ...read, diagram: { ...read.diagram, name } };
      }
      else if (str(args.template)) doc = fromTemplate(name, TEMPLATES.find(t => t.name === str(args.template)) ?? null, args.examples === true);
      if (str(args.kind)) doc = { ...doc, diagram: { ...doc.diagram, kind: kindOf(str(args.kind)).id satisfies KindId } };
      const made = (await api("POST", "/api/diagrams", { workspace: w.id, name, doc })) as Diagram;
      return { ...summary(made, "created"), workspace: w.name };
    },
  },
  {
    name: "apply_config",
    title: "Apply a config",
    description:
      "Changes a diagram from a Daidal config (YAML or JSON), the format get_diagram's yaml shows: connections go under edges (or connections), containers under boundaries, and a node's place under layout: { x, y } (or x and y). merge (the default) adds and updates: nodes and containers by id, tags by key, views by name, new connections added. replace makes the diagram exactly the config.",
    readOnly: false,
    destructive: true,
    inputSchema: schema({ diagram: DIAGRAM, config: { type: "string" }, mode: { type: "string", enum: ["merge", "replace"] } }, ["diagram", "config"]),
    run: async (args, api) => {
      const text = need(args, "config");
      const mode = args.mode === "replace" ? "replace" : "merge";
      const cats = await typesOf(api, args.diagram);
      return save(
        api,
        args.diagram,
        doc => {
          const read = readText(text, doc, mode);
          const odd = strangers(doc, read.doc, cats);
          const note = odd.length ? `. Types this workspace doesn't offer (shown with a plain icon): ${odd.join(", ")}; list_types shows the ones it does` : "";
          return just(read.doc, { summary: `${read.summary}${note}` });
        },
        mode === "replace" ? "replaced" : "merged",
      );
    },
  },
  {
    name: "add_node",
    title: "Add a node",
    description: "Adds a node, placed in free space (near another node if you say so). type is a display name from list_types, say Service or AI Agent.",
    readOnly: false,
    inputSchema: schema(
      {
        diagram: DIAGRAM,
        name: { type: "string" },
        type: { type: "string", description: "A type from list_types; Service if left out" },
        subtitle: { type: "string" },
        notes: { type: "string" },
        members: { type: "array", items: { type: "string" }, description: "What it holds besides its functions, one a line on its card (a class's fields, a file's exports, a table's columns): makes the card a code block" },
        functions: FUNCTIONS,
        path: { type: "string", description: "Where it lives: a file path, or a link to the source" },
        tags: { type: "array", items: { type: "string" }, description: "Tag keys or labels; new ones are made" },
        near: NODE("Place it beside this node"),
        x: { type: "number" },
        y: { type: "number" },
      },
      ["diagram", "name"],
    ),
    run: async (args, api) => {
      const name = need(args, "name");
      const type = typeIn(await typesOf(api, args.diagram), str(args.type).trim() || "Service");
      return save(
        api,
        args.diagram,
        doc => {
          let at = { x: 120, y: 120 };
          if (str(args.near).trim()) {
            const n = toScene(doc).nodes.find(o => o.id === nodeOf(doc, args.near, "near"))!;
            at = { x: n.x + n.w + 80, y: n.y };
          } else if (num(args.x) !== undefined && num(args.y) !== undefined) at = { x: num(args.x)!, y: num(args.y)! };
          else if ((doc.nodes ?? []).length) {
            const scene = toScene(doc).nodes;
            at = { x: Math.max(...scene.map(n => n.x + n.w)) + 80, y: Math.min(...scene.map(n => n.y)) };
          }
          const made = addNode(doc, type, at);
          const tagged = tagKeys(made.doc, list(args.tags));
          const change: NodeChange = { name, ...(str(args.subtitle) ? { subtitle: str(args.subtitle) } : {}), ...(str(args.notes) ? { notes: str(args.notes) } : {}) };
          if (Array.isArray(args.members)) change.members = list(args.members);
          if (Array.isArray(args.functions)) change.functions = toFunctions(args.functions);
          if (str(args.path)) change.path = str(args.path);
          if (tagged.keys.length) change.tags = tagged.keys;
          return just(updateNode(tagged.doc, made.id, change), { node: made.id });
        },
        `added ${name}`,
      );
    },
  },
  {
    name: "update_node",
    title: "Change a node",
    description: "Changes what you name on a node: name, type, subtitle, notes, members, functions and path (a code block's), tags (replaces them), flags (db, cache, mq), links (web pages, or diagrams to zoom into; replaces them), its own icon (null for its type's), or where it sits (x, y).",
    readOnly: false,
    inputSchema: schema(
      {
        diagram: DIAGRAM,
        node: NODE(),
        name: { type: "string" },
        type: { type: "string" },
        subtitle: { type: "string" },
        notes: { type: "string" },
        members: { type: "array", items: { type: "string" }, description: "What it holds besides its functions, one a line on its card (a class's fields, a file's exports, a table's columns): makes the card a code block" },
        functions: FUNCTIONS,
        path: { type: "string", description: "Where it lives: a file path, or a link to the source" },
        tags: { type: "array", items: { type: "string" } },
        flags: { type: "array", items: { type: "string", enum: ["db", "cache", "mq"] } },
        links: {
          type: "array",
          description: "Replaces its links. Each is a web page (url) or another diagram in the workspace to zoom into (diagram: its id, view: optionally one of its views)",
          items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" }, diagram: { type: "string" }, view: { type: "string" } }, additionalProperties: false },
        },
        icon: { type: ["string", "null"], description: "An icon from the library, or null for the type's" },
        x: { type: "number" },
        y: { type: "number" },
      },
      ["diagram", "node"],
    ),
    run: async (args, api) => {
      const type = typeof args.type === "string" ? typeIn(await typesOf(api, args.diagram), args.type) : undefined;
      const links = Array.isArray(args.links) ? await linksIn(api, args.links as Row[]) : undefined;
      return save(
        api,
        args.diagram,
        doc => {
          const id = nodeOf(doc, args.node);
          let next = doc;
          const change: NodeChange = {};
          for (const key of ["name", "subtitle", "notes", "path"] as const) if (typeof args[key] === "string") change[key] = args[key];
          if (Array.isArray(args.members)) change.members = list(args.members);
          if (Array.isArray(args.functions)) change.functions = toFunctions(args.functions);
          if (type) change.type = type;
          if (Array.isArray(args.flags)) change.flags = list(args.flags);
          if (links) change.links = links;
          if (args.icon === null) change.icon = null;
          else if (typeof args.icon === "string") {
            if (!isNodeIcon(args.icon)) throw new ToolError(`no icon ${JSON.stringify(args.icon)} in the library`);
            change.icon = args.icon;
          }
          if (Array.isArray(args.tags)) {
            const tagged = tagKeys(next, list(args.tags));
            next = tagged.doc;
            change.tags = tagged.keys;
          }
          next = updateNode(next, id, change);
          if (num(args.x) !== undefined || num(args.y) !== undefined) {
            const n = toScene(next).nodes.find(o => o.id === id)!;
            next = moveNodes(next, [id], (num(args.x) ?? n.x) - n.x, (num(args.y) ?? n.y) - n.y);
          }
          return just(next, { node: id });
        },
        "changed a node",
      );
    },
  },
  {
    name: "remove_node",
    title: "Remove a node",
    description: "Removes a node and its connections.",
    readOnly: false,
    destructive: true,
    inputSchema: schema({ diagram: DIAGRAM, node: NODE() }, ["diagram", "node"]),
    run: async (args, api) =>
      save(
        api,
        args.diagram,
        doc => {
          const id = nodeOf(doc, args.node);
          return just(removeNode(doc, id), { removed: id });
        },
        "removed a node",
      ),
  },
  {
    name: "connect",
    title: "Connect two nodes",
    description: "Adds a connection from one node (or container) to another, with an optional label, line, arrows and route.",
    readOnly: false,
    inputSchema: schema(
      { diagram: DIAGRAM, from: NODE("Where it starts"), to: NODE("Where it ends"), label: { type: "string" }, line: LINE, direction: DIRECTION, route: ROUTE },
      ["diagram", "from", "to"],
    ),
    run: async (args, api) =>
      save(
        api,
        args.diagram,
        doc => {
          const made = addEdge(doc, endOf(doc, args.from, "from"), endOf(doc, args.to, "to"));
          const change = edgeChange(args);
          return just(Object.keys(change).length ? updateEdge(made.doc, made.index, change) : made.doc, { connection: made.index });
        },
        "connected",
      ),
  },
  {
    name: "update_connection",
    title: "Change a connection",
    description: "Changes a connection, named by its index (from get_diagram) or by from and to: label, line, arrows, route, or reverse it.",
    readOnly: false,
    inputSchema: schema(
      { diagram: DIAGRAM, index: { type: "integer", minimum: 0 }, from: { type: "string" }, to: { type: "string" }, label: { type: "string" }, line: LINE, direction: DIRECTION, route: ROUTE },
      ["diagram"],
    ),
    run: async (args, api) =>
      save(
        api,
        args.diagram,
        doc => {
          const index = edgeOf(doc, args);
          return just(updateEdge(doc, index, edgeChange(args)), { connection: index });
        },
        "changed a connection",
      ),
  },
  {
    name: "remove_connection",
    title: "Remove a connection",
    description: "Removes a connection, named by its index or by from and to.",
    readOnly: false,
    destructive: true,
    inputSchema: schema({ diagram: DIAGRAM, index: { type: "integer", minimum: 0 }, from: { type: "string" }, to: { type: "string" } }, ["diagram"]),
    run: async (args, api) => save(api, args.diagram, doc => just(removeEdge(doc, edgeOf(doc, args))), "removed a connection"),
  },
  {
    name: "add_container",
    title: "Add a container",
    description: "Adds a labelled container (a VPC, a cluster, a team), sized to fit round the nodes you name; it then carries them when moved.",
    readOnly: false,
    inputSchema: schema({ diagram: DIAGRAM, label: { type: "string" }, around: { type: "array", items: { type: "string" }, description: "Nodes to put inside" } }, ["diagram", "label"]),
    run: async (args, api) => {
      const label = need(args, "label");
      return save(
        api,
        args.diagram,
        doc => {
          const ids = list(args.around).map(n => nodeOf(doc, n));
          const box = ids.length ? around(doc, ids) : null;
          const made = addBoundary(doc, box ? { x: box.x + 260, y: box.y + 170 } : { x: 400, y: 300 });
          let next = updateBoundary(made.doc, made.id, { label, moveContents: ids.length > 0 });
          if (box) next = resizeBoundary(moveBoundary(next, made.id, box.x, box.y), made.id, box.w, box.h);
          return just(next, { container: made.id });
        },
        `added ${label}`,
      );
    },
  },
  {
    name: "update_container",
    title: "Change a container",
    description: "Changes a container's label, or refits it round the nodes you name, or removes it (remove: true; what was inside stays).",
    readOnly: false,
    inputSchema: schema(
      { diagram: DIAGRAM, container: { type: "string", description: "Its id or label" }, label: { type: "string" }, around: { type: "array", items: { type: "string" } }, remove: { type: "boolean" } },
      ["diagram", "container"],
    ),
    run: async (args, api) =>
      save(
        api,
        args.diagram,
        doc => {
          const id = boxOf(doc, args.container);
          if (args.remove === true) return just(removeBoundary(doc, id), { removed: id });
          let next = typeof args.label === "string" ? updateBoundary(doc, id, { label: args.label }) : doc;
          const ids = list(args.around).map(n => nodeOf(next, n));
          if (ids.length) {
            const box = around(next, ids);
            next = updateBoundary(next, id, { moveContents: false });
            next = resizeBoundary(moveBoundary(next, id, box.x, box.y), id, box.w, box.h);
            next = updateBoundary(next, id, { moveContents: true });
          }
          return just(next, { container: id });
        },
        "changed a container",
      ),
  },
  {
    name: "tag_nodes",
    title: "Tag nodes",
    description: "Puts a tag on nodes (or takes it off with remove: true). A tag no node has yet is made, in group if given.",
    readOnly: false,
    inputSchema: schema(
      { diagram: DIAGRAM, tag: { type: "string", description: "A tag key or label" }, nodes: { type: "array", items: { type: "string" }, minItems: 1 }, group: { type: "string" }, remove: { type: "boolean" } },
      ["diagram", "tag", "nodes"],
    ),
    run: async (args, api) => {
      const tag = need(args, "tag");
      return save(
        api,
        args.diagram,
        doc => {
          const { doc: withTag, keys } = tagKeys(doc, [tag], str(args.group) || undefined);
          const key = keys[0];
          let next = withTag;
          for (const id of list(args.nodes).map(n => nodeOf(withTag, n))) {
            const tags = (next.nodes ?? []).find(n => n.id === id)?.tags ?? [];
            const want = args.remove === true ? tags.filter(t => t !== key) : [...new Set([...tags, key])];
            next = updateNode(next, id, { tags: want });
          }
          return just(next, { tag: key });
        },
        args.remove === true ? `untagged ${tag}` : `tagged ${tag}`,
      );
    },
  },
  {
    name: "save_view",
    title: "Save a view",
    description: "Saves a view: a name and the tags it shows. A view with that name is updated.",
    readOnly: false,
    inputSchema: schema({ diagram: DIAGRAM, name: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, ["diagram", "name"]),
    run: async (args, api) => {
      const name = need(args, "name");
      return save(
        api,
        args.diagram,
        doc => {
          const { doc: tagged, keys } = tagKeys(doc, list(args.tags));
          if ((tagged.views ?? []).some(v => v.name === name)) return just(updateView(tagged, name, { tags: keys }), { view: name });
          const made = addView(tagged, keys);
          return just(updateView(made.doc, made.name, { name }), { view: name });
        },
        `saved the view ${name}`,
      );
    },
  },
  {
    name: "take_snapshot",
    title: "Take a snapshot",
    description: "Keeps a named copy of the diagram as it is now, in its History, so the person can look back or compare. Do this before a big change.",
    readOnly: false,
    inputSchema: schema({ diagram: DIAGRAM, label: { type: "string" } }, ["diagram", "label"]),
    run: async (args, api) => {
      const d = await diagramOf(api, args.diagram);
      const snap = (await api("POST", `/api/diagrams/${q(d.id)}/snapshots`, { label: need(args, "label"), doc: d.doc })) as Row;
      return { diagram: d.id, snapshot: snap.id, label: snap.label };
    },
  },
];

function edgeChange(args: Row): EdgeChange {
  const change: EdgeChange = {};
  if (typeof args.label === "string") change.label = args.label;
  if (["solid", "dashed", "dotted"].includes(str(args.line))) change.line = args.line as DocEdge["line"];
  if (["forward", "back", "both", "none"].includes(str(args.direction))) change.direction = args.direction as DocEdge["direction"];
  if (["curved", "straight", "angled"].includes(str(args.route))) change.route = args.route as DocEdge["route"];
  return change;
}
