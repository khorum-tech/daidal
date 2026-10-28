import type { Anchor, SceneEdge, Side } from './model';

/**
 * Where a connection runs, ported from the prototype's canvas (web/index.html, "edges — each end is either
 * auto…"). Each end leaves from the centre of the side facing the other box, or from a pinned spot on a side.
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface EdgePath {
	d: string;
	/** Where the label sits. */
	lx: number;
	ly: number;
	dash: string;
	cap: 'round' | 'butt';
	markerEnd: string | null;
	markerStart: string | null;
}

const R = (v: number) => Math.round(v * 10) / 10;
const NRM: Record<Side, [number, number]> = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };

export function sidePoint(n: Box, side: Side, t: number): { x: number; y: number } {
	if (side === 'l') return { x: n.x, y: n.y + n.h * t };
	if (side === 'r') return { x: n.x + n.w, y: n.y + n.h * t };
	if (side === 't') return { x: n.x + n.w * t, y: n.y };
	return { x: n.x + n.w * t, y: n.y + n.h };
}

/** The side of [a] that faces [b]. */
export function autoSide(a: Box, b: Box): Side {
	const dx = b.x + b.w / 2 - (a.x + a.w / 2);
	const dy = b.y + b.h / 2 - (a.y + a.h / 2);
	return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : dy >= 0 ? 'b' : 't';
}

function endAt(n: Box, pin: Anchor | null, other: Box, gap: number) {
	const a = pin ?? { side: autoSide(n, other), t: 0.5 };
	const p = sidePoint(n, a.side, a.t);
	const [nx, ny] = NRM[a.side];
	return { x: p.x + nx * gap, y: p.y + ny * gap, nx, ny };
}

/** An orthogonal route with softened corners. */
function roundPath(pts: { x: number; y: number }[], r: number): string {
	let d = `M${R(pts[0].x)},${R(pts[0].y)}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const p = pts[i];
		const a = pts[i - 1];
		const b = pts[i + 1];
		const d1 = Math.hypot(p.x - a.x, p.y - a.y) || 1;
		const d2 = Math.hypot(b.x - p.x, b.y - p.y) || 1;
		const rr = Math.min(r, d1 / 2, d2 / 2);
		d +=
			` L${R(p.x + ((a.x - p.x) / d1) * rr)},${R(p.y + ((a.y - p.y) / d1) * rr)}` +
			` Q${R(p.x)},${R(p.y)} ${R(p.x + ((b.x - p.x) / d2) * rr)},${R(p.y + ((b.y - p.y) / d2) * rr)}`;
	}
	const z = pts[pts.length - 1];
	return `${d} L${R(z.x)},${R(z.y)}`;
}

/** The point halfway along [pts] by length. */
function midOf(pts: { x: number; y: number }[]) {
	const segs: number[] = [];
	let total = 0;
	for (let i = 1; i < pts.length; i++) {
		const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
		segs.push(len);
		total += len;
	}
	let acc = 0;
	for (let i = 0; i < segs.length; i++) {
		if (acc + segs[i] >= total / 2) {
			const f = (total / 2 - acc) / (segs[i] || 1);
			return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
		}
		acc += segs[i];
	}
	return pts[0];
}

/** The marker id for an arrowhead, by line weight (the canvas defines all six). */
function marker(base: 'arr' | 'arrRev', width: number): string {
	return base + (width > 2 ? 'Bold' : width < 1.1 ? 'Thin' : '');
}

export function edgePath(e: SceneEdge, a: Box, b: Box, defaultRoute: 'curved' | 'straight' | 'angled' = 'curved'): EdgePath {
	const hasEnd = e.dir === 'forward' || e.dir === 'both';
	const hasStart = e.dir === 'back' || e.dir === 'both';
	// Arrowheads need room, so an end with one stops a little further from its box.
	const A = endAt(a, e.fromA, b, hasStart ? 11 : 3);
	const B = endAt(b, e.toA, a, hasEnd ? 10 : 3);
	const sx = A.x;
	const sy = A.y;
	const ex = B.x;
	const ey = B.y;
	const dist = Math.hypot(ex - sx, ey - sy);
	const route = e.route ?? defaultRoute;
	let d: string;
	let lx = R((sx + ex) / 2);
	let ly = R((sy + ey) / 2);
	if (route === 'straight' || dist < 46) {
		d = `M${R(sx)},${R(sy)} L${R(ex)},${R(ey)}`;
	} else if (route === 'angled') {
		const hz1 = A.nx !== 0;
		const hz2 = B.nx !== 0;
		const pts = [{ x: sx, y: sy }];
		if (hz1 && hz2) {
			const mx = (sx + ex) / 2;
			pts.push({ x: mx, y: sy }, { x: mx, y: ey });
		} else if (!hz1 && !hz2) {
			const my = (sy + ey) / 2;
			pts.push({ x: sx, y: my }, { x: ex, y: my });
		} else if (hz1) pts.push({ x: ex, y: sy });
		else pts.push({ x: sx, y: ey });
		pts.push({ x: ex, y: ey });
		d = roundPath(pts, 7);
		const mid = midOf(pts);
		lx = R(mid.x);
		ly = R(mid.y);
	} else {
		const k = Math.max(22, Math.min(120, dist * 0.42));
		const c1x = sx + A.nx * k;
		const c1y = sy + A.ny * k;
		const c2x = ex + B.nx * k;
		const c2y = ey + B.ny * k;
		d = `M${R(sx)},${R(sy)} C${R(c1x)},${R(c1y)} ${R(c2x)},${R(c2y)} ${R(ex)},${R(ey)}`;
		lx = R((sx + 3 * c1x + 3 * c2x + ex) / 8);
		ly = R((sy + 3 * c1y + 3 * c2y + ey) / 8);
	}
	const w = e.width;
	return {
		d,
		lx,
		ly,
		dash: e.style === 'dashed' ? `${R(w * 4)} ${R(w * 3.2)}` : e.style === 'dotted' ? `0.01 ${R(w * 2.4)}` : '',
		cap: e.style === 'dotted' ? 'round' : 'butt',
		markerEnd: hasEnd ? marker('arr', w) : null,
		markerStart: hasStart ? marker('arrRev', w) : null
	};
}

/**
 * Where an end lands when dragged to [p] near box [n], as in the prototype (`snapTo`): the nearest side, and how far
 * along it (0 to 1), pulled onto a quarter when close to one.
 */
export function snapAnchor(n: Box, p: { x: number; y: number }): Anchor {
	const cand: { side: Side; t: number; d: number }[] = [
		{ side: 'l', t: (p.y - n.y) / n.h, d: Math.abs(p.x - n.x) },
		{ side: 'r', t: (p.y - n.y) / n.h, d: Math.abs(p.x - (n.x + n.w)) },
		{ side: 't', t: (p.x - n.x) / n.w, d: Math.abs(p.y - n.y) },
		{ side: 'b', t: (p.x - n.x) / n.w, d: Math.abs(p.y - (n.y + n.h)) }
	];
	// Past either end of a side counts as further from it.
	for (const c of cand) {
		const over = Math.max(0, -c.t, c.t - 1);
		c.d += (c.side === 'l' || c.side === 'r' ? n.h : n.w) * over;
	}
	const best = cand.reduce((m, c) => (c.d < m.d ? c : m), cand[0]);
	let t = Math.max(0, Math.min(1, best.t));
	const near = [0, 0.25, 0.5, 0.75, 1].find(s => Math.abs(t - s) < 0.075);
	t = near ?? Math.round(t * 100) / 100;
	return { side: best.side, t };
}

/** Where each end of a connection meets its box: its pinned spot, or the middle of the side facing the other box. */
export function endPoints(e: SceneEdge, a: Box, b: Box): { from: { x: number; y: number }; to: { x: number; y: number } } {
	const at = (n: Box, pin: Anchor | null, other: Box) => {
		const s = pin ?? { side: autoSide(n, other), t: 0.5 };
		return sidePoint(n, s.side, s.t);
	};
	return { from: at(a, e.fromA, b), to: at(b, e.toA, a) };
}
