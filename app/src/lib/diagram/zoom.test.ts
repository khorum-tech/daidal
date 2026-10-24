import { describe, expect, it } from 'vitest';
import { clampZoom, zoomAround } from './zoom';

describe('zoomAround', () => {
	it('keeps the content under the point where it was', () => {
		const scroll = { left: 100, top: 40 };
		const point = { x: 50, y: 30 };
		const z = zoomAround(1, 2, point, scroll);
		// Content coordinate under the point before and after: (scroll + point) / scale.
		expect((scroll.left + point.x) / 1).toBeCloseTo((z.left + point.x) / z.scale);
		expect((scroll.top + point.y) / 1).toBeCloseTo((z.top + point.y) / z.scale);
		expect(z).toEqual({ scale: 2, left: 250, top: 110 });
	});

	it('zooms out around the point too, and stays inside the allowed range', () => {
		expect(zoomAround(1, 0.5, { x: 0, y: 0 }, { left: 200, top: 100 })).toEqual({ scale: 0.5, left: 100, top: 50 });
		expect(zoomAround(1, 10, { x: 0, y: 0 }, { left: 0, top: 0 }).scale).toBe(2.5);
		expect(clampZoom(0.01)).toBe(0.25);
	});
});
