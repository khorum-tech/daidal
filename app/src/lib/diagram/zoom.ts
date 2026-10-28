/**
 * Where the canvas looks: a screen point p shows content point (p - t) / s. The canvas owns every gesture (drag,
 * pinch, wheel), so this is plain arithmetic rather than a scroll position.
 */
export interface View {
	s: number;
	tx: number;
	ty: number;
}
export interface Area {
	x0: number;
	y0: number;
	w: number;
	h: number;
}
export interface Point {
	x: number;
	y: number;
}

/** The zoom range the canvas allows (the prototype's: 25%–250%). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/** [area] scaled to fit a viewW × viewH view (never above [max]) and centred in it. */
export function fitView(area: Area, viewW: number, viewH: number, max = 1.25): View {
	const s = viewW > 0 && viewH > 0 ? Math.min(viewW / area.w, viewH / area.h, max) : 1;
	return { s, tx: (viewW - area.w * s) / 2 - area.x0 * s, ty: (viewH - area.h * s) / 2 - area.y0 * s };
}

/** Zoom to [next], keeping the content under screen point [p] where it is, as a pinch or ctrl+scroll should. */
export function zoomAt(v: View, next: number, p: Point): View {
	const s = clampZoom(next);
	return { s, tx: p.x - ((p.x - v.tx) / v.s) * s, ty: p.y - ((p.y - v.ty) / v.s) * s };
}

export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, tx: v.tx + dx, ty: v.ty + dy });

/** The content point under screen point [p]. */
export const toContent = (v: View, p: Point): Point => ({ x: (p.x - v.tx) / v.s, y: (p.y - v.ty) / v.s });

/** Keep at least [keep] px of [area] on screen on each axis, so panning can never lose the diagram. */
export function clampView(v: View, area: Area, viewW: number, viewH: number, keep = 80): View {
	const k = (len: number, size: number) => Math.min(keep, (len * v.s) / 2, size / 2);
	const kx = k(area.w, viewW);
	const ky = k(area.h, viewH);
	const lo = (keepPx: number, start: number, len: number) => keepPx - v.s * (start + len);
	const hi = (keepPx: number, start: number, size: number) => size - keepPx - v.s * start;
	return {
		s: v.s,
		tx: Math.min(hi(kx, area.x0, viewW), Math.max(lo(kx, area.x0, area.w), v.tx)),
		ty: Math.min(hi(ky, area.y0, viewH), Math.max(lo(ky, area.y0, area.h), v.ty))
	};
}

/** The view at the same zoom with content point [c] in the middle of a viewW × viewH view: where a minimap click goes. */
export const centreOn = (v: View, c: Point, viewW: number, viewH: number): View => ({ s: v.s, tx: viewW / 2 - c.x * v.s, ty: viewH / 2 - c.y * v.s });
