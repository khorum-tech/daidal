import type { Box } from '@khorum/daidal-core/geometry';

export interface Guide {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** How near (in screen pixels) an edge has to come to snap: a fingertip needs more room than a mouse pointer. */
export const SNAP_PX = { mouse: 9, touch: 20 } as const;

/**
 * Snap a box being dragged to the nodes around it, as the prototype does (web/index.html, "snapOn"): its left,
 * centre or right lines up with another node's left, centre or right when within [threshold], and the same for
 * top, middle and bottom. Returns where it lands and a guide line for each axis that snapped.
 */
export function snapBox(box: Box, others: Box[], threshold: number): { x: number; y: number; guides: Guide[] } {
	type Hit = { d: number; at: number; line: number; o: Box };
	let bx: Hit | null = null;
	let by: Hit | null = null;
	const mineX = [0, box.w / 2, box.w];
	const mineY = [0, box.h / 2, box.h];
	for (const o of others) {
		for (const t of [o.x, o.x + o.w / 2, o.x + o.w]) {
			for (const off of mineX) {
				const d = Math.abs(box.x + off - t);
				if (d <= threshold && (!bx || d < bx.d)) bx = { d, at: t - off, line: t, o };
			}
		}
		for (const t of [o.y, o.y + o.h / 2, o.y + o.h]) {
			for (const off of mineY) {
				const d = Math.abs(box.y + off - t);
				if (d <= threshold && (!by || d < by.d)) by = { d, at: t - off, line: t, o };
			}
		}
	}
	const x = bx ? bx.at : box.x;
	const y = by ? by.at : box.y;
	const guides: Guide[] = [];
	// Each guide runs past both boxes a little, as the prototype's do.
	if (bx) guides.push({ x1: bx.line, y1: Math.min(y, bx.o.y) - 24, x2: bx.line, y2: Math.max(y + box.h, bx.o.y + bx.o.h) + 24 });
	if (by) guides.push({ x1: Math.min(x, by.o.x) - 24, y1: by.line, x2: Math.max(x + box.w, by.o.x + by.o.w) + 24, y2: by.line });
	return { x, y, guides };
}
