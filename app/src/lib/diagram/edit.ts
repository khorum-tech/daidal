import type { DocNode, SkopeDoc } from '../types';
import { NODE_H, NODE_W, slug, toScene } from './model';

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
