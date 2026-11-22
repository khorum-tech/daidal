import type { DocBoundary, DocEdge, DocNode, DocTag, DaidalDoc } from './types';
import { NEW_TAG_GROUP, TAG_COLORS } from './edit';
import { isColor, slug } from './model';
import { parseYaml, yamlLines, YamlError } from './yaml';
import { toFunctions } from './code';

/**
 * A diagram as a config file (the prototype's config dock): the saved document as YAML or JSON, and back. Reading a
 * config checks it first, then either replaces the diagram with it or merges it in: nodes, containers, tags and
 * views by id or name (what the config says wins), connections added unless the diagram has them already.
 */

export type ConfigLang = 'yaml' | 'json';

export class ConfigError extends Error {
	constructor(
		message: string,
		readonly line?: number
	) {
		super(message);
	}
}

export function configText(doc: DaidalDoc, lang: ConfigLang): string {
	if (lang === 'json') return `${JSON.stringify(doc, null, 2)}\n`;
	const name = doc.diagram?.name;
	const head = name ? `# ${name}: a Daidal diagram config\n` : '';
	return `${head}${yamlLines(doc as unknown as Record<string, unknown>).join('\n')}\n`;
}

/** JSON when it opens with a brace or bracket, else YAML. */
export const langOf = (text: string): ConfigLang => (/^\s*[[{]/.test(text) ? 'json' : 'yaml');

function parse(text: string): Record<string, unknown> {
	let o: unknown;
	try {
		o = langOf(text) === 'json' ? JSON.parse(text) : parseYaml(text);
	} catch (e) {
		if (e instanceof YamlError) throw new ConfigError(e.message, e.line);
		throw new ConfigError(`That isn't valid JSON: ${(e as Error).message}`);
	}
	if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ConfigError('A config is a map of sections: nodes, edges, tags…');
	return o as Record<string, unknown>;
}

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
/** A value read from a file, as text: a string as it is, anything else as JSON writes it. */
function asText(v: unknown): string {
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	return JSON.stringify(v) ?? '';
}
function strings(v: unknown): string[] {
	if (Array.isArray(v)) return v.map(asText);
	if (v == null || v === '') return [];
	return [asText(v)];
}

const PLACE = ['x', 'y', 'w', 'h'] as const;

/** [o] with a plain x, y, w or h (as the MCP outline and add_node write them) moved into its layout. */
function withLayout(o: Record<string, unknown>): Record<string, unknown> {
	const loose = PLACE.filter(k => typeof o[k] === 'number');
	if (!loose.length) return o;
	const out = { ...o };
	const layout: Record<string, unknown> = { ...(o.layout && typeof o.layout === 'object' ? o.layout : {}) };
	for (const k of loose) {
		layout[k] ??= o[k];
		delete out[k];
	}
	out.layout = layout;
	return out;
}

/** The sections a config may have, and the other names (from the MCP outline) taken for two of them. */
const SECTIONS = ['version', 'diagram', 'tags', 'views', 'nodes', 'edges', 'boundaries'];
const ALIASES: Record<string, string> = { connections: 'edges', containers: 'boundaries' };

/** [o] with its sections checked, and connections and containers read as edges and boundaries. */
function sections(o: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const from: Record<string, string> = {};
	for (const [k, v] of Object.entries(o)) {
		const key = ALIASES[k] ?? k;
		if (!SECTIONS.includes(key)) throw new ConfigError(`Unknown section “${k}”: a config has ${SECTIONS.join(', ')}`);
		if (key in out) throw new ConfigError(`Use ${from[key]} or ${k}, not both`);
		out[key] = v;
		from[key] = k;
	}
	return out;
}

/** [n] with a name (its id) and a type (service) if it has none: a node a config adds, not one it updates. */
const filled = (n: DocNode): DocNode => ({ ...n, name: n.name ?? n.id, type: n.type ?? 'service' });

/** A node as the config gives it: an id, a slugged type if it names one, tags as a list. */
function node(raw: unknown, i: number): DocNode {
	if (!raw || typeof raw !== 'object') throw new ConfigError(`nodes[${i}] isn't a node`);
	const n = withLayout(raw as Record<string, unknown>);
	if (n.id == null || n.id === '') throw new ConfigError(`nodes[${i}]: every node needs an id`);
	const id = asText(n.id);
	const out: DocNode = { ...(n as unknown as DocNode), id };
	if (n.name != null) out.name = asText(n.name);
	if (n.type != null) out.type = slug(n.type);
	const tags = strings(n.tags);
	if (tags.length) out.tags = tags;
	else delete out.tags;
	if (n.members != null) {
		// One name a line: a list, or a single name on its own.
		const members = (Array.isArray(n.members) ? n.members : [n.members]).map(asText).map(m => m.trim()).filter(Boolean);
		if (members.length) out.members = members;
		else delete out.members;
	}
	if (n.functions != null) {
		// Entries with a name, params, returns and notes, or signatures ("check(batch: Batch): Verdict") read into them.
		if (typeof n.functions !== 'string' && !Array.isArray(n.functions) && (typeof n.functions !== 'object' || n.functions === null)) throw new ConfigError(`nodes[${i}].functions: a list of functions, each a signature or a map with a name`);
		const entries = Array.isArray(n.functions) ? n.functions : [n.functions];
		entries.forEach((f, j) => {
			if (f && typeof f === 'object' && !Array.isArray(f) && !asText((f as Record<string, unknown>).name ?? '').trim()) throw new ConfigError(`nodes[${i}].functions[${j}]: every function needs a name`);
		});
		const functions = toFunctions(n.functions);
		if (functions.length) out.functions = functions;
		else delete out.functions;
	}
	if (n.path != null) out.path = asText(n.path);
	return out;
}

/** Refuses a tag colour that isn't a colour: it would go into styles and exported SVG. */
function checkColours(tags: Record<string, DocTag>): void {
	for (const [key, tag] of Object.entries(tags)) {
		if (tag?.color !== undefined && !isColor(tag.color)) throw new ConfigError(`tags.${key}: “${asText(tag.color)}” isn't a colour; give it as #rrggbb`);
	}
}

/** Tags the nodes use that the config and the diagram don't define, made up as the prototype makes them. */
function tagsFor(nodes: DocNode[], tags: Record<string, DocTag>): Record<string, DocTag> {
	const out = { ...tags };
	for (const k of nodes.flatMap(n => n.tags ?? [])) {
		if (out[k]) continue;
		const label = k.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
		out[k] = { label, color: TAG_COLORS[Object.keys(out).length % TAG_COLORS.length], group: NEW_TAG_GROUP };
	}
	return out;
}

export interface ReadConfig {
	doc: DaidalDoc;
	/** What it did, for saying so. */
	summary: string;
}

/**
 * The diagram with [text] applied: in place of it ([mode] 'replace'), or merged into it ('merge'). Throws a
 * ConfigError, with a line for YAML, when the config can't be read or doesn't hold together.
 */
export function readConfig(text: string, current: DaidalDoc, mode: 'replace' | 'merge'): ReadConfig {
	const o = sections(parse(text));
	if (o.version !== undefined && o.version !== 1) throw new ConfigError(`This is version ${asText(o.version)} of the format; Daidal reads version 1`);
	const nodes = list<unknown>(o.nodes).map((n, i) => node(n, i));
	if (!nodes.length) throw new ConfigError('No nodes found: add a “nodes:” list');
	const ids = new Set<string>();
	for (const n of nodes) {
		if (ids.has(n.id)) throw new ConfigError(`Two nodes share the id “${n.id}”`);
		ids.add(n.id);
	}
	const boxes = list<DocBoundary>(o.boundaries).map((b, i) => {
		if (b?.id == null) throw new ConfigError(`boundaries[${i}]: every container needs an id`);
		return { ...(withLayout(b as unknown as Record<string, unknown>) as unknown as DocBoundary), id: asText(b.id) };
	});
	const known = new Set([...ids, ...boxes.map(b => b.id), ...(mode === 'merge' ? [...(current.nodes ?? []).map(n => n.id), ...(current.boundaries ?? []).map(b => b.id)] : [])]);
	const edges = list<DocEdge>(o.edges).map((e, i) => {
		if (e?.from == null || e?.to == null) throw new ConfigError(`edges[${i}]: needs both from and to`);
		for (const end of [asText(e.from), asText(e.to)]) if (!known.has(end)) throw new ConfigError(`edges[${i}]: no node or container with the id “${end}”`);
		return { ...e, from: asText(e.from), to: asText(e.to) };
	});
	const tags = (o.tags && typeof o.tags === 'object' && !Array.isArray(o.tags) ? o.tags : {}) as Record<string, DocTag>;
	checkColours(tags);
	const views = list<{ name: string; tags: string[] }>(o.views).filter(v => v?.name).map(v => ({ ...v, name: asText(v.name), tags: strings(v.tags) }));
	const diagram = { ...current.diagram, ...(o.diagram && typeof o.diagram === 'object' ? (o.diagram as DaidalDoc['diagram']) : {}), name: current.diagram?.name };
	if (!diagram.name) delete diagram.name;
	if (mode === 'replace') {
		const doc: DaidalDoc = { version: 1, diagram, tags: tagsFor(nodes, tags), views, nodes: nodes.map(filled), edges, boundaries: boxes };
		return { doc, summary: `Replaced with ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}` };
	}
	return merge(current, { nodes, edges, boundaries: boxes, tags, views, diagram });
}

function upsert<T>(base: T[], incoming: T[], key: (x: T) => string, combine: (a: T, b: T) => T): { list: T[]; added: number; updated: number } {
	const byKey = new Map(incoming.map(x => [key(x), x]));
	let updated = 0;
	const kept = base.map(x => {
		const next = byKey.get(key(x));
		if (!next) return x;
		byKey.delete(key(x));
		updated++;
		return combine(x, next);
	});
	return { list: [...kept, ...byKey.values()], added: byKey.size, updated };
}

function merge(current: DaidalDoc, cfg: { nodes: DocNode[]; edges: DocEdge[]; boundaries: DocBoundary[]; tags: Record<string, DocTag>; views: { name: string; tags: string[] }[]; diagram: DaidalDoc['diagram'] }): ReadConfig {
	const nodes = upsert(current.nodes ?? [], cfg.nodes, n => n.id, (a, b) => ({ ...a, ...b, layout: b.layout ? { ...a.layout, ...b.layout } : a.layout }));
	const boxes = upsert(current.boundaries ?? [], cfg.boundaries, b => b.id, (a, b) => ({ ...a, ...b }));
	const pair = (e: DocEdge) => `${e.from}>${e.to}`;
	const have = new Set((current.edges ?? []).map(pair));
	const newEdges = cfg.edges.filter(e => !have.has(pair(e)));
	const views = upsert(current.views ?? [], cfg.views, v => v.name, (a, b) => ({ ...a, ...b }));
	const doc: DaidalDoc = {
		...current,
		diagram: cfg.diagram,
		tags: tagsFor(nodes.list, { ...current.tags, ...cfg.tags }),
		views: views.list,
		nodes: nodes.list.map(filled),
		edges: [...(current.edges ?? []), ...newEdges],
		boundaries: boxes.list
	};
	const bits = [
		nodes.added && `${nodes.added} new ${nodes.added === 1 ? 'node' : 'nodes'}`,
		nodes.updated && `${nodes.updated} updated`,
		newEdges.length && `${newEdges.length} new ${newEdges.length === 1 ? 'connection' : 'connections'}`
	].filter(Boolean);
	return { doc, summary: `Merged in: ${bits.join(', ') || 'nothing new'}` };
}
