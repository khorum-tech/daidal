import type { DocBoundary, DocEdge, DocNode, DocTag, SkopeDoc } from '../types';
import { NODE_H, NODE_W, slug, toScene, type Anchor, type Scene, type Side } from './model';

/**
 * Changes to a document, each returning a new one so the old stays as it was (for undo). They follow the
 * prototype's editing rules (web/index.html addNode, deleteSel, pasteNodes) in the saved document's terms.
 */

/** The prototype's names for a freshly added node; other types get "New <type>". */
const NEW_NAME: Record<string, string> = { Note: 'Note', Text: 'Text' };
/** Notes and free text start wider than a card. */
const NEW_WIDTH: Record<string, number> = { Note: 200, Text: 230 };

/** An id no node in [doc] has yet, in the prototype's style ("n" and a timestamp). */
export function newNodeId(doc: SkopeDoc, now = Date.now()): string {
	const taken = new Set((doc.nodes ?? []).map(n => n.id));
	const stem = `n${now.toString(36)}`;
	let id = stem;
	let n = 1;
	while (taken.has(id)) id = `${stem}${++n}`;
	return id;
}

const GAP = 24;

/**
 * Where a [w]-wide card centred on [at] can sit without covering a node: there, if it is free, else the nearest
 * free spot a whole card (and a gap) away up, down, left or right, rings further out each time.
 */
export function freeSpot(doc: SkopeDoc, at: { x: number; y: number }, w: number): { x: number; y: number } {
	const boxes = toScene(doc).nodes;
	const free = (x: number, y: number) => !boxes.some(b => x < b.x + b.w + GAP && b.x < x + w + GAP && y < b.y + b.h + GAP && b.y < y + NODE_H + GAP);
	const x0 = Math.round(at.x - w / 2);
	const y0 = Math.round(at.y - NODE_H / 2);
	const dx = w + GAP;
	const dy = NODE_H + GAP;
	for (let ring = 0; ring <= 8; ring++) {
		const spots: [number, number][] = [];
		for (let i = -ring; i <= ring; i++)
			for (let j = -ring; j <= ring; j++) if (Math.max(Math.abs(i), Math.abs(j)) === ring) spots.push([x0 + i * dx, y0 + j * dy]);
		spots.sort((a, b) => Math.hypot(a[0] - x0, a[1] - y0) - Math.hypot(b[0] - x0, b[1] - y0));
		const hit = spots.find(([x, y]) => free(x, y));
		if (hit) return { x: hit[0], y: hit[1] };
	}
	return { x: x0, y: y0 };
}

/**
 * A node of [type] (a display name, e.g. "Web App") as near [at] as it fits without covering another node.
 * Returns the document and the new id.
 */
export function addNode(doc: SkopeDoc, type: string, at: { x: number; y: number }, now = Date.now()): { doc: SkopeDoc; id: string } {
	const id = newNodeId(doc, now);
	const w = NEW_WIDTH[type] ?? NODE_W;
	const spot = freeSpot(doc, at, w);
	const node: DocNode = {
		id,
		name: NEW_NAME[type] ?? `New ${type}`,
		type: slug(type),
		layout: { ...spot, ...(w === NODE_W ? {} : { w }) }
	};
	return { doc: { ...doc, nodes: [...(doc.nodes ?? []), node] }, id };
}

/** Drops a node and every connection to or from it. */
export function removeNode(doc: SkopeDoc, id: string): SkopeDoc {
	return {
		...doc,
		nodes: (doc.nodes ?? []).filter(n => n.id !== id),
		edges: (doc.edges ?? []).filter(e => e.from !== id && e.to !== id)
	};
}

/** A copy of a node, nudged down and right as the prototype pastes. Its connections stay with the original. */
export function duplicateNode(doc: SkopeDoc, id: string, now = Date.now()): { doc: SkopeDoc; id: string } | null {
	const src = (doc.nodes ?? []).find(n => n.id === id);
	if (!src) return null;
	const copy: DocNode = structuredClone(src);
	copy.id = newNodeId(doc, now);
	const at = src.layout ?? { x: 0, y: 0 };
	copy.layout = { ...at, x: at.x + 28, y: at.y + 28 };
	return { doc: { ...doc, nodes: [...(doc.nodes ?? []), copy] }, id: copy.id };
}

/** The smallest a node can be resized to (the prototype's limit). */
export const MIN_NODE = { w: 130, h: 64 };

/** Resizes a node; a size back at the default leaves the document, as the prototype's export does. */
export function resizeNode(doc: SkopeDoc, id: string, w: number, h: number): SkopeDoc {
	const scene = toScene(doc);
	return {
		...doc,
		nodes: (doc.nodes ?? []).map((n, i) => {
			if (n.id !== id) return n;
			const s = scene.nodes[i];
			const nw = Math.max(MIN_NODE.w, Math.round(w));
			const nh = Math.max(MIN_NODE.h, Math.round(h));
			return { ...n, layout: { x: s.x, y: s.y, ...(nw === NODE_W ? {} : { w: nw }), ...(nh === NODE_H ? {} : { h: nh }) } };
		})
	};
}

/** What the inspector edits on a node. Empty text fields leave the document. */
export type NodeChange = Partial<Pick<DocNode, 'name' | 'subtitle' | 'notes' | 'flags' | 'tags' | 'links'>> & {
	/** A display name, e.g. "Web App"; stored slugged. */
	type?: string;
};

export function updateNode(doc: SkopeDoc, id: string, change: NodeChange): SkopeDoc {
	return {
		...doc,
		nodes: (doc.nodes ?? []).map(n => {
			if (n.id !== id) return n;
			const next: DocNode = { ...n, ...change, ...(change.type === undefined ? {} : { type: slug(change.type) }) };
			for (const key of ['subtitle', 'notes'] as const) if (next[key] === '') delete next[key];
			for (const key of ['flags', 'tags', 'links'] as const) if (next[key]?.length === 0) delete next[key];
			return next;
		})
	};
}

/** A typed address as a link: the prototype adds https:// when the scheme is missing. */
export function linkUrl(raw: string): string {
	const s = raw.trim();
	return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** The host a link points at, for showing it; the raw text if it isn't a URL. */
export function hostOf(url: string): string {
	try {
		return new URL(linkUrl(url)).host.replace(/^www\./, '');
	} catch {
		return url;
	}
}

// ---- connections ----

/** A connection from one node to another, with the prototype's defaults (an arrow at the target, no label). */
export function addEdge(doc: SkopeDoc, from: string, to: string): { doc: SkopeDoc; index: number } {
	const edges = [...(doc.edges ?? []), { from, to }];
	return { doc: { ...doc, edges }, index: edges.length - 1 };
}

/** A new node of [type] at [at], connected from [from]: what dropping a connection on empty canvas makes. */
export function connectToNew(doc: SkopeDoc, from: string, type: string, at: { x: number; y: number }, now = Date.now()): { doc: SkopeDoc; id: string; index: number } {
	const made = addNode(doc, type, at, now);
	const linked = addEdge(made.doc, from, made.id);
	return { doc: linked.doc, id: made.id, index: linked.index };
}

export type EndSide = 'left' | 'right' | 'top' | 'bottom';

/** What the connection inspector edits. A null end side puts that end back on auto. */
export type EdgeChange = Partial<Pick<DocEdge, 'label' | 'showLabel' | 'line' | 'direction' | 'width' | 'route'>> & {
	fromSide?: EndSide | null;
	toSide?: EndSide | null;
};

/** The side an end is pinned to, or null when it is automatic. */
export function endSide(edge: DocEdge, end: 'from' | 'to'): EndSide | null {
	const side = edge.anchors?.[end]?.split(':')[0]?.trim().toLowerCase();
	const long: Record<string, EndSide> = { l: 'left', r: 'right', t: 'top', b: 'bottom', left: 'left', right: 'right', top: 'top', bottom: 'bottom' };
	return side ? (long[side] ?? null) : null;
}

const SIDE_NAME: Record<Side, EndSide> = { l: 'left', r: 'right', t: 'top', b: 'bottom' };

/** Pins one end of a connection to a spot on a side (dragged there), or with null puts it back on auto. */
export function setEnd(doc: SkopeDoc, index: number, end: 'from' | 'to', at: Anchor | null): SkopeDoc {
	return {
		...doc,
		edges: (doc.edges ?? []).map((e, i) => {
			if (i !== index) return e;
			const anchors = { ...e.anchors };
			if (at) anchors[end] = `${SIDE_NAME[at.side]}:${at.t}`;
			else delete anchors[end];
			const { anchors: _old, ...rest } = e;
			return Object.keys(anchors).length ? { ...rest, anchors } : rest;
		})
	};
}

export function updateEdge(doc: SkopeDoc, index: number, change: EdgeChange): SkopeDoc {
	return {
		...doc,
		edges: (doc.edges ?? []).map((e, i) => {
			if (i !== index) return e;
			const { fromSide, toSide, ...fields } = change;
			const next: DocEdge = { ...e, ...fields };
			if (fromSide !== undefined || toSide !== undefined) {
				const anchors = { ...next.anchors };
				// A newly pinned end sits in the middle of its side, as the prototype pins one.
				for (const [end, side] of [['from', fromSide], ['to', toSide]] as const) {
					if (side === null) delete anchors[end];
					else if (side) anchors[end] = `${side}:0.5`;
				}
				if (Object.keys(anchors).length) next.anchors = anchors;
				else delete next.anchors;
			}
			// Defaults stay out of the document, as the prototype's export leaves them out.
			if (next.label === '') delete next.label;
			if (next.showLabel === true) delete next.showLabel;
			if (next.line === 'solid') delete next.line;
			if (next.direction === 'forward') delete next.direction;
			return next;
		})
	};
}

/** The same connection the other way round; pinned ends swap with it. */
export function reverseEdge(doc: SkopeDoc, index: number): SkopeDoc {
	return {
		...doc,
		edges: (doc.edges ?? []).map((e, i) => {
			if (i !== index) return e;
			const next: DocEdge = { ...e, from: e.to, to: e.from };
			if (e.anchors) {
				const anchors: { from?: string; to?: string } = {};
				if (e.anchors.to) anchors.from = e.anchors.to;
				if (e.anchors.from) anchors.to = e.anchors.from;
				next.anchors = anchors;
			}
			return next;
		})
	};
}

export function removeEdge(doc: SkopeDoc, index: number): SkopeDoc {
	return { ...doc, edges: (doc.edges ?? []).filter((_, i) => i !== index) };
}

// ---- containers ----

/** The smallest a container may be resized to (the prototype's limits). */
export const MIN_BOX = { w: 140, h: 110 };

/** What sits wholly inside container [id]: the nodes and containers that move with it. */
export function contentsOf(scene: Scene, id: string): { nodes: string[]; boxes: string[] } {
	const b = scene.boundaries.find(x => x.id === id);
	if (!b) return { nodes: [], boxes: [] };
	const inside = (o: { x: number; y: number; w: number; h: number }) => o.x >= b.x && o.y >= b.y && o.x + o.w <= b.x + b.w && o.y + o.h <= b.y + b.h;
	return {
		nodes: scene.nodes.filter(inside).map(n => n.id),
		boxes: scene.boundaries.filter(o => o.id !== id && inside(o)).map(o => o.id)
	};
}

/** An id no node or container in [doc] has yet, in the prototype's style ("bx" and a timestamp). */
function newBoxId(doc: SkopeDoc, now: number): string {
	const taken = new Set([...(doc.nodes ?? []).map(n => n.id), ...(doc.boundaries ?? []).map(b => b.id)]);
	const stem = `bx${now.toString(36)}`;
	let id = stem;
	let n = 1;
	while (taken.has(id)) id = `${stem}${++n}`;
	return id;
}

/**
 * A new container centred on [at], as the prototype adds one: 520 × 340, labelled, and moving alone (so laying it
 * over existing nodes doesn't sweep them up when it is dragged).
 */
export function addBoundary(doc: SkopeDoc, at: { x: number; y: number }, now = Date.now()): { doc: SkopeDoc; id: string } {
	const id = newBoxId(doc, now);
	const box: DocBoundary = { id, label: 'NEW CONTAINER', moveContents: false, layout: { x: Math.round(at.x - 260), y: Math.round(at.y - 170), w: 520, h: 340 } };
	return { doc: { ...doc, boundaries: [...(doc.boundaries ?? []), box] }, id };
}

/** A copy of a container, nudged down and right, labelled as a copy. What is inside it is not copied. */
export function duplicateBoundary(doc: SkopeDoc, id: string, now = Date.now()): { doc: SkopeDoc; id: string } | null {
	const src = (doc.boundaries ?? []).find(b => b.id === id);
	if (!src) return null;
	const copy: DocBoundary = structuredClone(src);
	copy.id = newBoxId(doc, now);
	copy.label = `${src.label ?? ''} copy`.trim();
	const lay = src.layout ?? { x: 40, y: 40, w: 540, h: 340 };
	copy.layout = { ...lay, x: lay.x + 40, y: lay.y + 40 };
	return { doc: { ...doc, boundaries: [...(doc.boundaries ?? []), copy] }, id: copy.id };
}

/** What the container inspector edits. */
export interface BoundaryChange {
	label?: string;
	labelPosition?: string;
	borderWidth?: number;
	borderStyle?: 'solid' | 'dashed' | 'dotted';
	moveContents?: boolean;
}

/** The border after [change]: only the fields it names change. */
function mergedBorder(b: DocBoundary, change: BoundaryChange): DocBoundary['border'] {
	const border = { ...b.border };
	if (change.borderWidth !== undefined) border.width = change.borderWidth;
	if (change.borderStyle !== undefined) border.style = change.borderStyle;
	return border;
}

/** Defaults stay out of the document, as the prototype's export leaves them out. */
function withoutBoxDefaults(b: DocBoundary): DocBoundary {
	const next: DocBoundary = { ...b };
	if (next.label === '') delete next.label;
	if (next.labelPosition === 'inside-bl') delete next.labelPosition;
	if (next.moveContents === true) delete next.moveContents;
	if (!next.border) return next;
	const border = { ...next.border };
	if (border.width === 1) delete border.width;
	if (border.style === 'dashed') delete border.style;
	if (Object.keys(border).length) next.border = border;
	else delete next.border;
	return next;
}

export function updateBoundary(doc: SkopeDoc, id: string, change: BoundaryChange): SkopeDoc {
	const { label, labelPosition, moveContents } = change;
	const fields = Object.fromEntries(Object.entries({ label, labelPosition, moveContents }).filter(([, v]) => v !== undefined));
	const touchesBorder = change.borderWidth !== undefined || change.borderStyle !== undefined;
	return {
		...doc,
		boundaries: (doc.boundaries ?? []).map(b =>
			b.id === id ? withoutBoxDefaults({ ...b, ...fields, ...(touchesBorder ? { border: mergedBorder(b, change) } : {}) }) : b
		)
	};
}

/** Moves a container to ([x], [y]), and by the same amount what sits wholly inside it, unless it moves alone. */
export function moveBoundary(doc: SkopeDoc, id: string, x: number, y: number): SkopeDoc {
	const scene = toScene(doc);
	const b = scene.boundaries.find(o => o.id === id);
	if (!b) return doc;
	const dx = x - b.x;
	const dy = y - b.y;
	const kids = b.moveContents ? contentsOf(scene, id) : { nodes: [], boxes: [] };
	const shift = <T extends { layout?: { x: number; y: number } }>(o: T, sx: number, sy: number, w?: number, h?: number): T => ({
		...o,
		layout: { ...(o.layout ?? { x: sx, y: sy }), ...(w === undefined ? {} : { w, h }), x: Math.round(sx + dx), y: Math.round(sy + dy) }
	});
	return {
		...doc,
		nodes: (doc.nodes ?? []).map(n => {
			const s = kids.nodes.includes(n.id) ? scene.nodes.find(o => o.id === n.id) : undefined;
			return s ? shift(n, s.x, s.y) : n;
		}),
		boundaries: (doc.boundaries ?? []).map((o, i) => {
			const s = scene.boundaries[i];
			return s.id === id || kids.boxes.includes(s.id) ? (shift(o, s.x, s.y, s.w, s.h) as DocBoundary) : o;
		})
	};
}

export function resizeBoundary(doc: SkopeDoc, id: string, w: number, h: number): SkopeDoc {
	const scene = toScene(doc);
	return {
		...doc,
		boundaries: (doc.boundaries ?? []).map((o, i) => {
			const s = scene.boundaries[i];
			if (s.id !== id) return o;
			return { ...o, layout: { x: s.x, y: s.y, w: Math.max(MIN_BOX.w, Math.round(w)), h: Math.max(MIN_BOX.h, Math.round(h)) } };
		})
	};
}

/** Drops a container and the connections to or from it; what was inside stays where it is. */
export function removeBoundary(doc: SkopeDoc, id: string): SkopeDoc {
	return {
		...doc,
		boundaries: (doc.boundaries ?? []).filter(b => b.id !== id),
		edges: (doc.edges ?? []).filter(e => e.from !== id && e.to !== id)
	};
}

// ---- tags and views ----

/** The prototype's house palette (Nocturne) and its wider one (Spectrum): what a tag's colour is picked from. */
export const TAG_COLORS = ['#d2cefd', '#b5abfc', '#968ae0', '#796cbf', '#5d5294', '#c9b9f7', '#9690c9', '#9397ab'];
export const MORE_TAG_COLORS = ['#e0707c', '#e3925c', '#dfc264', '#a9cc6a', '#5fbf86', '#4fbcb0', '#54a8dd', '#6f8ce8', '#9a7fe2', '#cf7fd0', '#c08e6e', '#7fc9c2', '#b7c96b', '#98a0b2'];
/** Where a tag made from a node lands, as in the prototype. */
export const NEW_TAG_GROUP = 'Unlabelled';

/**
 * A new tag, keyed by its slugged label (made unique), coloured from the palette in turn. Returns the document and
 * the new key.
 */
export function addTag(doc: SkopeDoc, label: string, group = NEW_TAG_GROUP): { doc: SkopeDoc; key: string } {
	const tags = doc.tags ?? {};
	const stem = slug(label);
	let key = stem;
	let n = 1;
	while (tags[key]) key = `${stem}-${++n}`;
	const color = TAG_COLORS[Object.keys(tags).length % TAG_COLORS.length];
	return { doc: { ...doc, tags: { ...tags, [key]: { label: label.trim(), color, group: group.trim() || NEW_TAG_GROUP } } }, key };
}

export function updateTag(doc: SkopeDoc, key: string, change: { label?: string; color?: string; group?: string }): SkopeDoc {
	const tag = doc.tags?.[key];
	if (!tag) return doc;
	const next = { ...tag, ...Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)) };
	if (change.group !== undefined) next.group = change.group.trim() || NEW_TAG_GROUP;
	return { ...doc, tags: { ...doc.tags, [key]: next } };
}

/** Drops a tag, and takes it off every node and out of every view. */
export function removeTag(doc: SkopeDoc, key: string): SkopeDoc {
	const tags = { ...doc.tags };
	delete tags[key];
	return {
		...doc,
		tags,
		nodes: (doc.nodes ?? []).map(n => (n.tags?.includes(key) ? withoutEmpty({ ...n, tags: n.tags.filter(t => t !== key) }) : n)),
		views: (doc.views ?? []).map(v => (v.tags.includes(key) ? { ...v, tags: v.tags.filter(t => t !== key) } : v))
	};
}

function withoutEmpty(n: DocNode): DocNode {
	if (n.tags?.length === 0) delete n.tags;
	return n;
}

/** A new view of [tags], named "View N" with the first free N, as the prototype names one. */
export function addView(doc: SkopeDoc, tags: string[]): { doc: SkopeDoc; name: string } {
	const views = doc.views ?? [];
	let n = views.length + 1;
	while (views.some(v => v.name === `View ${n}`)) n++;
	const name = `View ${n}`;
	return { doc: { ...doc, views: [...views, { name, tags: [...tags] }] }, name };
}

/** Whether [name] could be given to view [current] (not empty, and no other view has it). */
export function viewNameFree(doc: SkopeDoc, name: string, current: string): boolean {
	const n = name.trim();
	return !!n && !(doc.views ?? []).some(v => v.name === n && v.name !== current);
}

/** Renames a view or re-saves its tags. A rename keeps it the default view if it was. */
const isLocked = (doc: SkopeDoc, name: string) => !!doc.views?.find(v => v.name === name)?.locked;

/** Renames or re-saves a view; a locked one stays as it is. */
export function updateView(doc: SkopeDoc, name: string, change: { name?: string; tags?: string[] }): SkopeDoc {
	const rename = change.name?.trim();
	if (isLocked(doc, name) || (rename !== undefined && !viewNameFree(doc, rename, name))) return doc;
	const next: SkopeDoc = {
		...doc,
		views: (doc.views ?? []).map(v => (v.name === name ? { ...v, name: rename ?? v.name, tags: change.tags ? [...change.tags] : v.tags } : v))
	};
	if (rename && doc.diagram?.view === name) next.diagram = { ...doc.diagram, view: rename };
	return next;
}

/** Locks a view (the prototype's freeze) or unlocks it; an unlocked view leaves the flag out. */
export function lockView(doc: SkopeDoc, name: string, locked: boolean): SkopeDoc {
	return {
		...doc,
		views: (doc.views ?? []).map(v => {
			if (v.name !== name) return v;
			const next = { ...v, locked: true };
			if (!locked) delete (next as { locked?: boolean }).locked;
			return next;
		})
	};
}

/** Deletes a view, unless it is locked. */
export function removeView(doc: SkopeDoc, name: string): SkopeDoc {
	if (isLocked(doc, name)) return doc;
	const next: SkopeDoc = { ...doc, views: (doc.views ?? []).filter(v => v.name !== name) };
	if (doc.diagram?.view === name) {
		const diagram = { ...doc.diagram };
		delete diagram.view;
		next.diagram = diagram;
	}
	return next;
}

/** The view the diagram opens on, or (null) everything. */
export function setDefaultView(doc: SkopeDoc, name: string | null): SkopeDoc {
	const diagram = { ...doc.diagram };
	if (name) diagram.view = name;
	else delete diagram.view;
	return { ...doc, diagram };
}

// ---- many at once ----

/** What is picked at once: nodes by id, connections by their place in the document. */
export interface Picked {
	nodes: string[];
	edges: number[];
}

/** Drops the picked nodes (with every connection to or from them) and the picked connections. */
export function removeMany(doc: SkopeDoc, picked: Picked): SkopeDoc {
	const gone = new Set(picked.nodes);
	return {
		...doc,
		nodes: (doc.nodes ?? []).filter(n => !gone.has(n.id)),
		edges: (doc.edges ?? []).filter((e, i) => !picked.edges.includes(i) && !gone.has(e.from) && !gone.has(e.to))
	};
}

export function updateNodes(doc: SkopeDoc, ids: string[], change: NodeChange): SkopeDoc {
	return ids.reduce((d, id) => updateNode(d, id, change), doc);
}

/** A tag on every one of [ids], or, when they all carry it already, off every one (the prototype's chip). */
export function toggleTagOn(doc: SkopeDoc, ids: string[], key: string): SkopeDoc {
	const picked = (doc.nodes ?? []).filter(n => ids.includes(n.id));
	const all = picked.length > 0 && picked.every(n => n.tags?.includes(key));
	return picked.reduce((d, n) => {
		let tags = n.tags ?? [];
		if (all) tags = tags.filter(t => t !== key);
		else if (!tags.includes(key)) tags = [...tags, key];
		return updateNode(d, n.id, { tags });
	}, doc);
}

export function updateEdges(doc: SkopeDoc, indices: number[], change: EdgeChange): SkopeDoc {
	return indices.reduce((d, i) => updateEdge(d, i, change), doc);
}

/** Moves [ids] together by ([dx], [dy]). */
export function moveNodes(doc: SkopeDoc, ids: string[], dx: number, dy: number): SkopeDoc {
	const scene = toScene(doc);
	return {
		...doc,
		nodes: (doc.nodes ?? []).map((n, i) => {
			if (!ids.includes(n.id)) return n;
			const s = scene.nodes[i];
			return { ...n, layout: { ...(n.layout ?? { x: s.x, y: s.y }), x: Math.round(s.x + dx), y: Math.round(s.y + dy) } };
		})
	};
}

/** What a copy carries: the nodes, the connections between them, and the tags they use. */
export interface Clip {
	nodes: DocNode[];
	edges: DocEdge[];
	tags: Record<string, DocTag>;
}

export function copyNodes(doc: SkopeDoc, ids: string[]): Clip {
	const scene = toScene(doc);
	const nodes = (doc.nodes ?? []).flatMap((n, i) => {
		if (!ids.includes(n.id)) return [];
		const s = scene.nodes[i];
		// Every copied node carries where it was drawn, so a paste keeps the group's shape.
		return [{ ...structuredClone(n), layout: { ...n.layout, x: s.x, y: s.y } }];
	});
	const keys = new Set(nodes.flatMap(n => n.tags ?? []));
	return {
		nodes,
		edges: (doc.edges ?? []).filter(e => ids.includes(e.from) && ids.includes(e.to)).map(e => structuredClone(e)),
		tags: Object.fromEntries(Object.entries(doc.tags ?? {}).filter(([k]) => keys.has(k)))
	};
}

/**
 * The clip's nodes added as new ones, shifted by ([dx], [dy]), with the connections between them. A tag the
 * document doesn't have comes along; one it has stays as the document has it. Returns the new ids.
 */
export function pasteNodes(doc: SkopeDoc, clip: Clip, dx: number, dy: number, now = Date.now()): { doc: SkopeDoc; ids: string[] } {
	const map = new Map<string, string>();
	let nodes = doc.nodes ?? [];
	for (const n of clip.nodes) {
		const id = newNodeId({ ...doc, nodes }, now);
		map.set(n.id, id);
		const at = n.layout ?? { x: 0, y: 0 };
		nodes = [...nodes, { ...structuredClone(n), id, layout: { ...at, x: Math.round(at.x + dx), y: Math.round(at.y + dy) } }];
	}
	const edges = clip.edges.filter(e => map.has(e.from) && map.has(e.to)).map(e => ({ ...structuredClone(e), from: map.get(e.from)!, to: map.get(e.to)! }));
	const tags = { ...doc.tags };
	for (const [k, t] of Object.entries(clip.tags)) if (!tags[k]) tags[k] = structuredClone(t);
	return {
		doc: { ...doc, nodes, edges: [...(doc.edges ?? []), ...edges], ...(Object.keys(tags).length ? { tags } : {}) },
		ids: [...map.values()]
	};
}

/** The middle of the clip's nodes, so a paste into another diagram can land them around a point. */
export function clipCentre(clip: Clip): { x: number; y: number } {
	const boxes = toScene({ version: 1, nodes: clip.nodes }).nodes;
	if (!boxes.length) return { x: 0, y: 0 };
	const x0 = Math.min(...boxes.map(b => b.x));
	const y0 = Math.min(...boxes.map(b => b.y));
	const x1 = Math.max(...boxes.map(b => b.x + b.w));
	const y1 = Math.max(...boxes.map(b => b.y + b.h));
	return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
