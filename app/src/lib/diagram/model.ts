import type { DocBoundary, DocEdge, DocNode, SkopeDoc } from '../types';
import { TYPE_CATS } from './icons';

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

const KNOWN_TYPES = TYPE_CATS.flatMap(c => c.items.map(([label]) => label));

/** A slugged type back to its display name: a known type's own spelling, else Title Case words. */
export function typeName(value: unknown): string {
	if (!value) return 'Service';
	const s = slug(value);
	return KNOWN_TYPES.find(t => slug(t) === s) ?? String(value).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function node(n: DocNode, i: number, tagKeys: Set<string>): SceneNode {
	const lay = n.layout ?? { x: 60 + (i % 4) * 280, y: 80 + Math.floor(i / 4) * 160 };
	const type = typeName(n.type);
	return {
		id: String(n.id),
		name: String(n.name ?? n.id),
		type,
		sub: n.subtitle ?? '',
		desc: n.notes ?? '',
		flags: Array.isArray(n.flags) ? n.flags : [],
		tags: (Array.isArray(n.tags) ? n.tags : []).filter(t => tagKeys.has(t)),
		links: Array.isArray(n.links) ? n.links.filter(l => l && typeof l.url === 'string') : [],
		x: num(lay.x, 0),
		y: num(lay.y, 0),
		w: num(lay.w, NODE_W),
		h: num(lay.h, NODE_H),
		isText: type === 'Text'
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

export function toScene(doc: SkopeDoc): Scene {
	const tags = Object.entries(doc.tags ?? {}).map(([key, t]) => ({
		key,
		label: t.label ?? key,
		color: t.color ?? '#9397ab',
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
		nodes: (doc.nodes ?? []).map((n, i) => node(n, i, tagKeys)),
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
