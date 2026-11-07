import type { DocBoundary, DocEdge, DocNode, SkopeDoc } from '../types';
import { isNodeIcon, TYPE_CATS, typeIcon, typeKey, type TypeCats } from './icons';
import { c4Line, c4Role, kindOf, type C4Role, type Kind } from './kinds';

/**
 * A document turned into what the canvas draws. The rules follow the prototype's config import
 * (web/index.html `applyCfg`) so a diagram looks the same in both frontends.
 */

/** The prototype's default card height and width. */
export const NODE_H = 88;
export const NODE_W = 190;
/** The prototype's canvas is a 1240 × 800 sheet; content may spill past it. */
export const SHEET_W = 1240;
export const SHEET_H = 800;

export type Side = 'l' | 'r' | 't' | 'b';
export interface Anchor {
	side: Side;
	t: number;
}

export interface SceneTag {
	key: string;
	label: string;
	color: string;
	group: string;
}

export interface SceneNode {
	id: string;
	name: string;
	/** The display type, e.g. "Web App" (documents store it slugged: "web-app"). */
	type: string;
	/** What the card draws: the node's own icon, else its type's. */
	icon: string;
	/** The node's own icon, when it has one. */
	ownIcon: string | null;
	sub: string;
	desc: string;
	flags: string[];
	tags: string[];
	links: { label?: string; url: string }[];
	x: number;
	y: number;
	w: number;
	h: number;
	isText: boolean;
	/** A sticky note: its name as a heading and its notes written out beneath, with no icon or type. */
	isNote: boolean;
	/**
	 * In a C4 diagram (Context, Container, Component): its role, C4 element line, and the description under them (its
	 * notes; for a person or system, whose line has no technology, its subtitle when it has no notes). Otherwise null.
	 */
	c4: { role: C4Role; line: string; desc: string } | null;
}

export interface SceneEdge {
	key: string;
	/** Its place in the document's edges: how an edit finds it. */
	index: number;
	from: string;
	to: string;
	label: string;
	showLabel: boolean;
	style: 'solid' | 'dashed' | 'dotted';
	dir: 'forward' | 'back' | 'both' | 'none';
	width: number;
	route: 'curved' | 'straight' | 'angled' | null;
	fromA: Anchor | null;
	toA: Anchor | null;
}

export interface SceneBoundary {
	id: string;
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
	pos: string;
	bw: number;
	bs: 'solid' | 'dashed' | 'dotted';
	/** Whether moving it carries what sits wholly inside (the prototype's lock; on unless switched off). */
	moveContents: boolean;
}

export interface SceneView {
	label: string;
	tags: string[];
	locked: boolean;
}

export interface Scene {
	name: string;
	kind: string;
	tags: SceneTag[];
	views: SceneView[];
	initialView: string | null;
	nodes: SceneNode[];
	edges: SceneEdge[];
	boundaries: SceneBoundary[];
}

/** The prototype's slug rule (web/index.html `cfgSlug`). */
export function slug(s: unknown): string {
	return (
		String(s ?? '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			// Runs are already single dashes, so at most one sits at either end.
			.replace(/^-|-$/g, '') || 'unspecified'
	);
}

/** A slugged type back to its display name: a known type's own spelling (in [cats]), else Title Case words. */
export function typeName(value: unknown, cats: TypeCats = TYPE_CATS): string {
	if (!value) return 'Service';
	const s = typeKey(slug(value));
	for (const c of cats) for (const [label] of c.items) if (typeKey(label) === s) return label;
	return (typeof value === 'string' ? value : s).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const SIDE_IN: Record<string, Side> = { left: 'l', right: 'r', top: 't', bottom: 'b', l: 'l', r: 'r', t: 't', b: 'b' };

/** "left:0.25" → { side: 'l', t: 0.25 }. Anything unreadable is an auto end (null). */
export function parseAnchor(value: unknown): Anchor | null {
	if (typeof value !== 'string') return null;
	const [side, at] = value.split(':');
	const s = SIDE_IN[side.trim().toLowerCase()];
	if (!s) return null;
	const t = Number.parseFloat(at);
	return { side: s, t: Math.max(0, Math.min(1, Number.isNaN(t) ? 0.5 : t)) };
}

/** How a sticky note is laid out, in pixels: shared by the canvas card and the SVG export so they agree. */
export const NOTE = { pad: 12, headSize: 13, headLine: 18, gap: 4, size: 12, line: 17 } as const;

/** One paragraph's words broken into lines of at most [max] characters; a word longer than that is split. */
function wrapParagraph(para: string, max: number): string[] {
	const lines: string[] = [];
	let line = '';
	const chunks = (word: string) => Array.from({ length: Math.ceil(word.length / max) }, (_, i) => word.slice(i * max, (i + 1) * max));
	const pieces = para.split(/\s+/).flatMap(chunks);
	for (const piece of pieces) {
		if (line && line.length + 1 + piece.length <= max) line += ` ${piece}`;
		else {
			if (line) lines.push(line);
			line = piece;
		}
	}
	lines.push(line);
	return lines;
}

/** [text] broken into lines that fit [w] pixels at [size]: at spaces where it can, mid-word where a word is too long. */
export function wrapText(text: string, w: number, size: number): string[] {
	const max = Math.max(1, Math.floor(w / (size * 0.56)));
	const lines = text.replaceAll('\r', '').split('\n').flatMap(para => wrapParagraph(para, max));
	while (lines.length && lines.at(-1) === '') lines.pop();
	return lines;
}

/** The lines of a note's text at width [w]. */
export const noteLines = (notes: string, w: number) => wrapText(notes, w - 2 * NOTE.pad, NOTE.size);

/** The height a note needs to show its heading and every line of its text at width [w]. */
export function noteHeight(name: string, notes: string, w: number): number {
	const head = wrapText(name, w - 2 * NOTE.pad, NOTE.headSize).length * NOTE.headLine;
	const body = noteLines(notes, w).length;
	return Math.ceil(2 * NOTE.pad + head + (body ? NOTE.gap + body * NOTE.line : 0));
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * How a C4 card is laid out, in pixels: shared by the canvas card and the SVG export so they agree. A person's card
 * leaves room at the top for a head; a store's, for a cylinder's rim.
 */
export const C4 = { pad: 12, nameSize: 14, nameLine: 18, kindSize: 11, kindLine: 15, descSize: 11.5, descLine: 15, gap: 6, maxDesc: 3, head: 14, rim: 10 } as const;

/** A person's card is taller than most: its head takes room at the top, and the body keeps room for the text. */
export const C4_PERSON_H = NODE_H + 16;

/** A C4 card's description at width [w]: its notes wrapped, at most [C4.maxDesc] lines, the last cut with an ellipsis. */
export function c4Desc(notes: string, w: number): string[] {
	const lines = wrapText(notes, w - 2 * C4.pad, C4.descSize);
	if (lines.length <= C4.maxDesc) return lines;
	const kept = lines.slice(0, C4.maxDesc);
	kept[C4.maxDesc - 1] = `${kept[C4.maxDesc - 1].slice(0, -1).trimEnd()}…`;
	return kept;
}

/** The lines of a C4 card's name and element line at width [w]. */
export const c4Name = (name: string, w: number) => wrapText(name, w - 2 * C4.pad, C4.nameSize);
export const c4Kind = (line: string, w: number) => wrapText(line, w - 2 * C4.pad, C4.kindSize);

/** Where a C4 card's text starts below its top: past the head or rim its shape has. */
const SHAPE_TOP: Partial<Record<C4Role, number>> = { person: C4.head, store: C4.rim };
export const c4Top = (role: C4Role) => C4.pad + (SHAPE_TOP[role] ?? 0);

/** The height a C4 card needs for its name, element line and description at width [w]. */
export function c4Height(role: C4Role, name: string, line: string, notes: string, w: number): number {
	const needed = Math.ceil(c4Top(role) + c4Text(name, line, notes, w) + C4.pad);
	return role === 'person' ? Math.max(needed, C4_PERSON_H) : needed;
}

/** How tall a C4 card's text is at width [w]: its name, element line and description, stacked. */
export function c4Text(name: string, line: string, notes: string, w: number): number {
	const desc = c4Desc(notes, w).length;
	return c4Name(name, w).length * C4.nameLine + c4Kind(line, w).length * C4.kindLine + (desc ? C4.gap + desc * C4.descLine : 0);
}

/** What a C4 card says under its element line: its notes; for a person or system, whose line has no technology, its subtitle when it has no notes. */
function c4About(role: C4Role, n: DocNode): string {
	if (n.notes?.trim()) return n.notes;
	return role === 'person' || role === 'system' || role === 'external' ? (n.subtitle ?? '') : '';
}

function node(n: DocNode, i: number, tagKeys: Set<string>, cats: TypeCats, kind: Kind): SceneNode {
	const lay = n.layout ?? { x: 60 + (i % 4) * 280, y: 80 + Math.floor(i / 4) * 160 };
	const type = typeName(n.type, cats);
	const ownIcon = isNodeIcon(n.icon) ? n.icon : null;
	const role = type === 'Note' || type === 'Text' ? null : c4Role(kind, type);
	const c4 = role ? { role, line: c4Line(role, kind, n.subtitle ?? ''), desc: c4About(role, n) } : null;
	const w = num(lay.w, NODE_W);
	const h = num(lay.h, NODE_H);
	const name = String(n.name ?? n.id);
	let drawnH = h;
	if (c4) drawnH = Math.max(h, c4Height(c4.role, name, c4.line, c4.desc, w));
	else if (type === 'Note') drawnH = Math.max(h, noteHeight(name, n.notes ?? '', w));
	return {
		id: String(n.id),
		name: String(n.name ?? n.id),
		type,
		icon: ownIcon ?? typeIcon(type, cats),
		ownIcon,
		sub: n.subtitle ?? '',
		desc: n.notes ?? '',
		flags: Array.isArray(n.flags) ? n.flags : [],
		tags: (Array.isArray(n.tags) ? n.tags : []).filter(t => tagKeys.has(t)),
		links: Array.isArray(n.links) ? n.links.filter(l => l && typeof l.url === 'string') : [],
		x: num(lay.x, 0),
		y: num(lay.y, 0),
		w,
		h: drawnH,
		isText: type === 'Text',
		isNote: type === 'Note',
		c4
	};
}

function edge(e: DocEdge, i: number): SceneEdge {
	const line = e.line;
	return {
		key: `${e.from}>${e.to}#${i}`,
		index: i,
		from: String(e.from),
		to: String(e.to),
		label: e.label ?? '',
		showLabel: e.showLabel !== false,
		style: line === 'dashed' || line === 'dotted' ? line : 'solid',
		dir: e.direction && ['forward', 'back', 'both', 'none'].includes(e.direction) ? e.direction : 'forward',
		width: num(e.width, 1.4),
		route: e.route && ['curved', 'straight', 'angled'].includes(e.route) ? e.route : null,
		fromA: parseAnchor(e.anchors?.from),
		toA: parseAnchor(e.anchors?.to)
	};
}

function boundary(b: DocBoundary, i: number): SceneBoundary {
	const lay = b.layout ?? { x: 40, y: 40, w: 540, h: 340 };
	const pos = /^(inside|outside)-(tl|tr|bl|br)$/.test(b.labelPosition ?? '') ? b.labelPosition! : 'inside-bl';
	const style = b.border?.style;
	return {
		id: b.id != null ? String(b.id) : `b${i}`,
		label: b.label ?? '',
		x: num(lay.x, 40),
		y: num(lay.y, 40),
		w: num(lay.w, 540),
		h: num(lay.h, 340),
		pos,
		bw: num(b.border?.width, 1),
		bs: style === 'solid' || style === 'dotted' ? style : 'dashed',
		moveContents: b.moveContents !== false
	};
}

/**
 * Whether [v] is a colour a tag may have: hex, or rgb()/hsl() with plain numbers. A tag's colour goes into style
 * attributes and exported SVG, so anything else (a `;`, a `url(…)`, a quote) is refused, on the server too.
 */
export function isColor(v: unknown): v is string {
	return typeof v === 'string' && (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl)a?\([\d.,%\s/]+\)$/i.test(v));
}

/** [doc] as the canvas draws it, its types read against [cats] (a workspace's catalogue; the built-ins unless given). */
export function toScene(doc: SkopeDoc, cats: TypeCats = TYPE_CATS): Scene {
	const kind = kindOf(doc.diagram?.kind);
	const tags = Object.entries(doc.tags ?? {}).map(([key, t]) => ({
		key,
		label: t.label ?? key,
		color: isColor(t.color) ? t.color : '#9397ab',
		group: t.group || 'Ungrouped'
	}));
	const tagKeys = new Set(tags.map(t => t.key));
	const views = (doc.views ?? [])
		.filter(v => v && v.name)
		.map(v => ({ label: v.name, tags: (Array.isArray(v.tags) ? v.tags : []).filter(t => tagKeys.has(t)), locked: v.locked === true }));
	const want = doc.diagram?.view;
	return {
		name: doc.diagram?.name ?? '',
		kind: doc.diagram?.kind ?? '',
		tags,
		views,
		initialView: views.some(v => v.label === want) ? want! : null,
		nodes: (doc.nodes ?? []).map((n, i) => node(n, i, tagKeys, cats, kind)),
		edges: (doc.edges ?? []).map((e, i) => edge(e, i)),
		boundaries: (doc.boundaries ?? []).map((b, i) => boundary(b, i))
	};
}

/** Which tags are switched on: a named view's tags, or all of them. */
export function tagsOn(scene: Scene, view: string | null): Record<string, boolean> {
	const v = view ? scene.views.find(x => x.label === view) : undefined;
	return Object.fromEntries(scene.tags.map(t => [t.key, v ? v.tags.includes(t.key) : true]));
}

/** A tagged node with none of its tags on is ghosted; an untagged node always shows. */
export function isHidden(n: { tags: string[] }, on: Record<string, boolean>): boolean {
	return n.tags.length > 0 && !n.tags.some(t => on[t]);
}

/** Tag groups in first-seen order, each with its tags. */
export function tagGroups(scene: Scene): { name: string; tags: SceneTag[] }[] {
	const order: string[] = [];
	for (const t of scene.tags) if (!order.includes(t.group)) order.push(t.group);
	return order.map(name => ({ name, tags: scene.tags.filter(t => t.group === name) }));
}

/** The box that holds every node and boundary, so the canvas can fit it. */
export function bounds(scene: Scene): { x: number; y: number; w: number; h: number } {
	const boxes = [...scene.nodes, ...scene.boundaries];
	if (!boxes.length) return { x: 0, y: 0, w: SHEET_W, h: SHEET_H };
	const x0 = Math.min(...boxes.map(b => b.x));
	const y0 = Math.min(...boxes.map(b => b.y));
	const x1 = Math.max(...boxes.map(b => b.x + b.w));
	const y1 = Math.max(...boxes.map(b => b.y + b.h));
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The square an icon-only card takes, as in the prototype's icon mode. */
export const ICON_CARD = 104;

/**
 * The scene with each card shrunk to an icon-sized square on its own centre, so connections land near the icon.
 * Free text and notes stay as they are. Only what is drawn changes; the document keeps its sizes.
 */
export function iconScene(scene: Scene): Scene {
	const S = ICON_CARD;
	return {
		...scene,
		nodes: scene.nodes.map(n => (n.isText || n.isNote ? n : { ...n, x: Math.round(n.x + (n.w - S) / 2), y: Math.round(n.y + (n.h - S) / 2), w: S, h: S }))
	};
}
