/** The zoom range the canvas allows (the prototype's: 25%–250%). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/**
 * Zoom from [scale] to [next] keeping the content under [point] (relative to the scrolled view) where it is, as a
 * pinch or ctrl+scroll should. Returns the new scale and the scroll offsets that hold that point still.
 */
export function zoomAround(
	scale: number,
	next: number,
	point: { x: number; y: number },
	scroll: { left: number; top: number }
): { scale: number; left: number; top: number } {
	const z = clampZoom(next);
	const k = z / scale;
	return { scale: z, left: (scroll.left + point.x) * k - point.x, top: (scroll.top + point.y) * k - point.y };
}
