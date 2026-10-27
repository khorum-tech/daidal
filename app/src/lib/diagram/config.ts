import type { DocBoundary, DocEdge, DocNode, DocTag, SkopeDoc } from '../types';
import { NEW_TAG_GROUP, TAG_COLORS } from './edit';
import { slug } from './model';
import { parseYaml, yamlLines, YamlError } from './yaml';

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

export function configText(doc: SkopeDoc, lang: ConfigLang): string {
	if (lang === 'json') return `${JSON.stringify(doc, null, 2)}\n`;
	const name = doc.diagram?.name;
	return `${name ? `# ${name}: a Skope diagram config\n` : ''}${yamlLines(doc as unknown as Record<string, unknown>).join('\n')}\n`;
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
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);

/** A node as the document keeps it: an id and a name, a slugged type, tags as a list. */
function node(raw: unknown, i: number): DocNode {
	if (!raw || typeof raw !== 'object') throw new ConfigError(`nodes[${i}] isn't a node`);
	const n = raw as Record<string, unknown>;
	if (n.id == null || n.id === '') throw new ConfigError(`nodes[${i}]: every node needs an id`);
	const id = String(n.id);
	const out: DocNode = { ...(n as unknown as DocNode), id, name: String(n.name ?? id), type: slug(n.type ?? 'service') };
	const tags = strings(n.tags);
	if (tags.length) out.tags = tags;
	else delete out.tags;
	return out;
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
	doc: SkopeDoc;
	/** What it did, for saying so. */
	summary: string;
}

/**
 * The diagram with [text] applied: in place of it ([mode] 'replace'), or merged into it ('merge'). Throws a
 * ConfigError, with a line for YAML, when the config can't be read or doesn't hold together.
 */
export function readConfig(text: string, current: SkopeDoc, mode: 'replace' | 'merge'): ReadConfig {
	const o = parse(text);
	if (o.version !== undefined && o.version !== 1) throw new ConfigError(`This is version ${String(o.version)} of the format; Skope reads version 1`);
	const nodes = list<unknown>(o.nodes).map(node);
	if (!nodes.length) throw new ConfigError('No nodes found: add a “nodes:” list');
	const ids = new Set<string>();
	for (const n of nodes) {
		if (ids.has(n.id)) throw new ConfigError(`Two nodes share the id “${n.id}”`);
		ids.add(n.id);
	}
	const boxes = list<DocBoundary>(o.boundaries).map((b, i) => {
		if (!b || b.id == null) throw new ConfigError(`boundaries[${i}]: every container needs an id`);
		return { ...b, id: String(b.id) };
	});
	const known = new Set([...ids, ...boxes.map(b => b.id), ...(mode === 'merge' ? [...(current.nodes ?? []).map(n => n.id), ...(current.boundaries ?? []).map(b => b.id)] : [])]);
	const edges = list<DocEdge>(o.edges).map((e, i) => {
		if (!e || e.from == null || e.to == null) throw new ConfigError(`edges[${i}]: needs both from and to`);
		for (const end of [e.from, e.to]) if (!known.has(String(end))) throw new ConfigError(`edges[${i}]: no node or container with the id “${String(end)}”`);
		return { ...e, from: String(e.from), to: String(e.to) };
	});
	const tags = (o.tags && typeof o.tags === 'object' && !Array.isArray(o.tags) ? o.tags : {}) as Record<string, DocTag>;
	const views = list<{ name: string; tags: string[] }>(o.views).filter(v => v && v.name).map(v => ({ ...v, name: String(v.name), tags: strings(v.tags) }));
	const diagram = { ...current.diagram, ...(o.diagram && typeof o.diagram === 'object' ? (o.diagram as SkopeDoc['diagram']) : {}), name: current.diagram?.name };
	if (!diagram.name) delete diagram.name;
	if (mode === 'replace') {
		const doc: SkopeDoc = { version: 1, diagram, tags: tagsFor(nodes, tags), views, nodes, edges, boundaries: boxes };
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

function merge(current: SkopeDoc, cfg: { nodes: DocNode[]; edges: DocEdge[]; boundaries: DocBoundary[]; tags: Record<string, DocTag>; views: { name: string; tags: string[] }[]; diagram: SkopeDoc['diagram'] }): ReadConfig {
	const nodes = upsert(current.nodes ?? [], cfg.nodes, n => n.id, (a, b) => ({ ...a, ...b, layout: b.layout ? { ...a.layout, ...b.layout } : a.layout }));
	const boxes = upsert(current.boundaries ?? [], cfg.boundaries, b => b.id, (a, b) => ({ ...a, ...b }));
	const pair = (e: DocEdge) => `${e.from}>${e.to}`;
	const have = new Set((current.edges ?? []).map(pair));
	const newEdges = cfg.edges.filter(e => !have.has(pair(e)));
	const views = upsert(current.views ?? [], cfg.views, v => v.name, (a, b) => ({ ...a, ...b }));
	const doc: SkopeDoc = {
		...current,
		diagram: cfg.diagram,
		tags: tagsFor(nodes.list, { ...current.tags, ...cfg.tags }),
		views: views.list,
		nodes: nodes.list,
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
