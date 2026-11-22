import type { DocBoundary, DocEdge, DocNode, DocTag, DaidalDoc, Snapshot } from '../types';
import { removeBoundary, removeNode } from '@khorum/daidal-core/edit';
import { toScene } from '@khorum/daidal-core/model';

/**
 * Reviewing what a lead diagram changed, for a follower: the prototype's diffSnaps and applyOne (web/index.html)
 * over saved documents. Each change between two of the lead's snapshots has an id made of the newer snapshot's id
 * and what it touches ("<snapshot>:na:<node>"), which is how a verdict (accepted or skipped) is kept.
 */

export type ChangeKind = 'node-add' | 'node-del' | 'node-edit' | 'node-tags' | 'node-move' | 'edge-add' | 'edge-del' | 'edge-edit' | 'box-add' | 'box-del' | 'box-edit';

export interface Change {
	id: string;
	kind: ChangeKind;
	label: string;
	detail: string;
	/** What applying it needs: the lead's version of the node, connection or container, and any tags it uses. */
	node?: DocNode;
	edge?: DocEdge;
	box?: DocBoundary;
	/** The node, container or connection (by "from>to", "#n" for a repeat) it is about. */
	target: string;
	tags?: Record<string, DocTag>;
	/** For an update to a node: the fields that changed, and only those are taken. */
	fields?: (keyof DocNode)[];
}

/** Connections have no ids, so each is known by its ends, with a count for repeats of the same pair. */
function edgeKeys(edges: DocEdge[]): Map<string, DocEdge> {
	const seen = new Map<string, number>();
	const out = new Map<string, DocEdge>();
	for (const e of edges) {
		const pair = `${e.from}>${e.to}`;
		const n = (seen.get(pair) ?? 0) + 1;
		seen.set(pair, n);
		out.set(n === 1 ? pair : `${pair}#${n}`, e);
	}
	return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sorted = (xs?: string[]) => [...(xs ?? [])].sort((x, y) => x.localeCompare(y)).join(',');
const tagsOf = (doc: DaidalDoc, keys: string[] = []) => Object.fromEntries(keys.filter(k => doc.tags?.[k]).map(k => [k, doc.tags![k]]));

type Key = (p: string) => string;
type SceneNode = ReturnType<typeof toScene>['nodes'][number];

/** What an update to a node changes: the bits to show and the fields to take. */
function nodeEdit(o: DocNode, n: DocNode, os: SceneNode, ns: SceneNode) {
	const tests: [keyof DocNode, boolean, string][] = [
		['name', os.name !== ns.name, `name → ${ns.name}`],
		['subtitle', os.sub !== ns.sub, `subtitle → ${ns.sub || '—'}`],
		['type', os.type !== ns.type, `type → ${ns.type}`],
		['flags', sorted(o.flags) !== sorted(n.flags), `flags → ${(n.flags ?? []).join(', ') || 'none'}`],
		['notes', os.desc !== ns.desc, 'notes'],
		['members', os.members.join('\n') !== ns.members.join('\n'), 'members'],
		['functions', !same(os.functions, ns.functions), 'functions'],
		['path', os.path !== ns.path, `path → ${ns.path || '—'}`],
		['links', !same(o.links, n.links), 'links']
	];
	const hits = tests.filter(([, differs]) => differs);
	return { fields: hits.map(([field]) => field), bits: hits.map(([, , bit]) => bit) };
}

/** The changes to one node both versions have: its fields, its tags, where it is. */
function nodeUpdates(b: DaidalDoc, o: DocNode, n: DocNode, os: SceneNode, ns: SceneNode, k: Key): Change[] {
	const out: Change[] = [];
	const { fields, bits } = nodeEdit(o, n, os, ns);
	if (bits.length) out.push({ id: k(`ne:${n.id}`), kind: 'node-edit', label: `Update “${os.name}”`, detail: bits.join(' · '), node: n, target: n.id, fields });
	if (sorted(o.tags) !== sorted(n.tags)) {
		const names = (n.tags ?? []).map(t => b.tags?.[t]?.label ?? t);
		out.push({ id: k(`nt:${n.id}`), kind: 'node-tags', label: `Retag “${ns.name}”`, detail: names.join(', ') || 'no tags', node: n, target: n.id, tags: tagsOf(b, n.tags) });
	}
	if (os.x !== ns.x || os.y !== ns.y) out.push({ id: k(`nm:${n.id}`), kind: 'node-move', label: `Move “${ns.name}”`, detail: `to ${Math.round(ns.x)}, ${Math.round(ns.y)}`, node: n, target: n.id });
	return out;
}

function nodeChanges(a: DaidalDoc, b: DaidalDoc, k: Key): Change[] {
	const an = new Map((a.nodes ?? []).map(n => [n.id, n]));
	const bn = new Map((b.nodes ?? []).map(n => [n.id, n]));
	const at = new Map(toScene(a).nodes.map(n => [n.id, n]));
	const bt = new Map(toScene(b).nodes.map(n => [n.id, n]));
	const added = (b.nodes ?? [])
		.filter(n => !an.has(n.id))
		.map((n): Change => {
			const s = bt.get(n.id)!;
			return { id: k(`na:${n.id}`), kind: 'node-add', label: `Add “${s.name}”`, detail: s.type + (s.sub ? ` · ${s.sub}` : ''), node: n, target: n.id, tags: tagsOf(b, n.tags) };
		});
	const removed = (a.nodes ?? [])
		.filter(n => !bn.has(n.id))
		.map((n): Change => ({ id: k(`nd:${n.id}`), kind: 'node-del', label: `Remove “${at.get(n.id)!.name}”`, detail: at.get(n.id)!.type, target: n.id }));
	const updated = (b.nodes ?? []).flatMap(n => {
		const o = an.get(n.id);
		return o ? nodeUpdates(b, o, n, at.get(n.id)!, bt.get(n.id)!, k) : [];
	});
	return [...added, ...removed, ...updated];
}

/** What changed on a connection both versions have, as bits to show. */
function edgeEdit(o: DocEdge, e: DocEdge): string[] {
	const tests: [boolean, string][] = [
		[(o.label ?? '') !== (e.label ?? ''), `label → ${e.label || '—'}`],
		[(o.line ?? 'solid') !== (e.line ?? 'solid'), `line → ${e.line ?? 'solid'}`],
		[(o.direction ?? 'forward') !== (e.direction ?? 'forward'), `arrows → ${e.direction ?? 'forward'}`],
		[(o.width ?? 1.4) !== (e.width ?? 1.4), 'weight'],
		[!same(o.anchors, e.anchors), 'line ends'],
		[(o.route ?? '') !== (e.route ?? ''), `route → ${e.route ?? 'default'}`],
		[(o.showLabel ?? true) !== (e.showLabel ?? true), e.showLabel === false ? 'label hidden' : 'label shown']
	];
	return tests.filter(([differs]) => differs).map(([, bit]) => bit);
}

/** What a connection's ends are called, in either version: a node's name or a container's label. */
function endNames(a: DaidalDoc, b: DaidalDoc): (e: DocEdge) => string {
	const names = new Map([...toScene(a).nodes, ...toScene(b).nodes].map(n => [n.id, n.name]));
	for (const bx of [...(a.boundaries ?? []), ...(b.boundaries ?? [])]) if (bx.label) names.set(bx.id, bx.label);
	return e => `${names.get(e.from) ?? e.from} → ${names.get(e.to) ?? e.to}`;
}

function edgeChanges(a: DaidalDoc, b: DaidalDoc, k: Key): Change[] {
	const ae = edgeKeys(a.edges ?? []);
	const be = edgeKeys(b.edges ?? []);
	const nm = endNames(a, b);
	const added = [...be].filter(([key]) => !ae.has(key)).map(([key, e]): Change => ({ id: k(`ea:${key}`), kind: 'edge-add', label: `Connect ${nm(e)}`, detail: e.label || 'no label', edge: e, target: key }));
	const removed = [...ae].filter(([key]) => !be.has(key)).map(([key, e]): Change => ({ id: k(`ed:${key}`), kind: 'edge-del', label: `Disconnect ${nm(e)}`, detail: e.label ?? '', target: key }));
	const updated = [...be].flatMap(([key, e]): Change[] => {
		const o = ae.get(key);
		const bits = o ? edgeEdit(o, e) : [];
		return bits.length ? [{ id: k(`ee:${key}`), kind: 'edge-edit', label: `Update ${nm(e)}`, detail: bits.join(' · '), edge: e, target: key }] : [];
	});
	return [...added, ...removed, ...updated];
}

function boxChanges(a: DaidalDoc, b: DaidalDoc, k: Key): Change[] {
	const out: Change[] = [];
	const ab = new Map((a.boundaries ?? []).map(x => [x.id, x]));
	const bb = new Map((b.boundaries ?? []).map(x => [x.id, x]));
	const name = (x: DocBoundary) => (x.label ? `“${x.label}”` : 'a container');
	for (const [id, x] of bb) if (!ab.has(id)) out.push({ id: k(`ba:${id}`), kind: 'box-add', label: `Add container ${name(x)}`, detail: '', box: x, target: id });
	for (const [id, x] of ab) if (!bb.has(id)) out.push({ id: k(`bd:${id}`), kind: 'box-del', label: `Remove container ${name(x)}`, detail: '', target: id });
	for (const [id, x] of bb) {
		const o = ab.get(id);
		if (o && !same(o, x)) out.push({ id: k(`be:${id}`), kind: 'box-edit', label: `Update container ${name(o)}`, detail: same(o.layout, x.layout) ? 'label or border' : 'place or size', box: x, target: id });
	}
	return out;
}

/** What changed from [a] to [b], keyed under [key] (the newer snapshot's id). */
export function diffDocs(a: DaidalDoc, b: DaidalDoc, key: string): Change[] {
	const k = (p: string) => `${key}:${p}`;
	return [...nodeChanges(a, b, k), ...edgeChanges(a, b, k), ...boxChanges(a, b, k)];
}

/** Puts tags the follower doesn't have yet into it, so a node brought in keeps its tags. */
function withTags(doc: DaidalDoc, tags: Record<string, DocTag> = {}): DaidalDoc {
	const missing = Object.entries(tags).filter(([key]) => !doc.tags?.[key]);
	return missing.length ? { ...doc, tags: { ...doc.tags, ...Object.fromEntries(missing) } } : doc;
}

function replaceEdge(doc: DaidalDoc, key: string, edge: DocEdge | null): DaidalDoc {
	const keys = [...edgeKeys(doc.edges ?? []).entries()];
	const hit = keys.find(([k]) => k === key)?.[1];
	if (!hit) return doc;
	const swap = edge ? [structuredClone(edge)] : [];
	const edges = (doc.edges ?? []).flatMap(e => (e === hit ? swap : [e]));
	return { ...doc, edges };
}

/** The follower's document with one of the lead's changes in it. */
export function applyChange(doc: DaidalDoc, ch: Change): DaidalDoc {
	const nodes = doc.nodes ?? [];
	switch (ch.kind) {
		case 'node-add':
			return withTags({ ...doc, nodes: [...nodes.filter(n => n.id !== ch.target), structuredClone(ch.node!)] }, ch.tags);
		case 'node-del':
			return removeNode(doc, ch.target);
		case 'node-edit':
		case 'node-tags':
		case 'node-move':
			return withTags({ ...doc, nodes: nodes.map(n => (n.id === ch.target ? editNode(n, ch) : n)) }, ch.tags);
		case 'edge-add':
			return edgeKeys(doc.edges ?? []).has(ch.target) ? doc : { ...doc, edges: [...(doc.edges ?? []), structuredClone(ch.edge!)] };
		case 'edge-del':
			return replaceEdge(doc, ch.target, null);
		case 'edge-edit':
			return replaceEdge(doc, ch.target, ch.edge!);
		case 'box-add':
		case 'box-edit':
			return { ...doc, boundaries: [...(doc.boundaries ?? []).filter(x => x.id !== ch.target), structuredClone(ch.box!)] };
		case 'box-del':
			return removeBoundary(doc, ch.target);
	}
}

function editNode(n: DocNode, ch: Change): DocNode {
	const lead = ch.node!;
	if (ch.kind === 'node-move') {
		const at = toScene({ version: 1, nodes: [lead] }).nodes[0];
		return { ...n, layout: { ...n.layout, x: at.x, y: at.y } };
	}
	const fields = ch.kind === 'node-tags' ? (['tags'] as const) : (ch.fields ?? []);
	const next: DocNode = { ...n };
	for (const f of fields) {
		if (lead[f] === undefined) delete next[f];
		else (next as unknown as Record<string, unknown>)[f] = structuredClone(lead[f]);
	}
	return next;
}

export interface PendingGroup {
	snapshot: Snapshot;
	changes: Change[];
}

/**
 * The lead's snapshots newer than the one the follower is synced to, each with what it changed from the one before
 * (those that changed nothing left out). A follower synced to nothing the lead still has starts from its first.
 */
export function pending(snapshots: Snapshot[], syncedId: string | null): PendingGroup[] {
	const found = syncedId ? snapshots.findIndex(s => s.id === syncedId) : -1;
	const from = Math.max(found, 0);
	return snapshots
		.slice(from + 1)
		.map((s, i) => ({ snapshot: s, changes: diffDocs(snapshots[from + i].doc, s.doc, s.id) }))
		.filter(g => g.changes.length);
}

/**
 * What accepting [chosen] takes: those changes, and a node a connection among them needs that [doc] doesn't have
 * yet, when one of the [offered] changes adds it (accepting "Connect A → B" brings B in, even if B was skipped).
 */
export function withNeeded(doc: DaidalDoc, chosen: Change[], offered: Change[]): Change[] {
	const have = new Set([...(doc.nodes ?? []).map(n => n.id), ...(doc.boundaries ?? []).map(b => b.id)]);
	for (const c of chosen) if (c.kind === 'node-add' || c.kind === 'box-add') have.add(c.target);
	const needed = new Set(chosen.flatMap(c => (c.kind === 'edge-add' && c.edge ? [c.edge.from, c.edge.to] : [])).filter(id => !have.has(id)));
	const extra = offered.filter(c => (c.kind === 'node-add' || c.kind === 'box-add') && needed.has(c.target) && !chosen.includes(c));
	// The nodes go first, so the connection lands on them.
	return [...extra, ...chosen];
}
