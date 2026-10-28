import { describe, expect, it } from 'vitest';
import { clampView, clampZoom, fitView, panBy, toContent, zoomAt, type View, centreOn } from './zoom';

const area = { x0: 100, y0: 50, w: 1000, h: 500 };

describe('fitView', () => {
	it('fits the area to the narrower side and centres it', () => {
		const v = fitView(area, 500, 1000);
		expect(v.s).toBe(0.5);
		// The area's left edge lands at 0 and its middle at the view's middle.
		expect(v.tx + area.x0 * v.s).toBe(0);
		expect(v.ty + (area.y0 + area.h / 2) * v.s).toBe(500);
	});

	it('never scales a small diagram past the maximum', () => {
		expect(fitView({ x0: 0, y0: 0, w: 100, h: 100 }, 1000, 1000).s).toBe(1.25);
	});
});

describe('zoomAt', () => {
	it('keeps the content under the point where it was', () => {
		const v: View = { s: 1, tx: -40, ty: 10 };
		const p = { x: 120, y: 80 };
		const z = zoomAt(v, 2, p);
		expect(toContent(z, p)).toEqual(toContent(v, p));
		expect(z.s).toBe(2);
	});

	it('stays inside the allowed range', () => {
		expect(zoomAt({ s: 1, tx: 0, ty: 0 }, 10, { x: 0, y: 0 }).s).toBe(2.5);
		expect(clampZoom(0.01)).toBe(0.25);
	});
});

describe('panning', () => {
	it('moves the view by the drag', () => {
		expect(panBy({ s: 2, tx: 5, ty: 5 }, 10, -20)).toEqual({ s: 2, tx: 15, ty: -15 });
	});

	it('stops before the diagram leaves the view, on every side', () => {
		const v = fitView(area, 500, 400);
		const far = clampView(panBy(v, -10_000, -10_000), area, 500, 400);
		// The area's right and bottom edges stay at least 80 px into the view.
		expect(far.tx + (area.x0 + area.w) * far.s).toBeCloseTo(80);
		expect(far.ty + (area.y0 + area.h) * far.s).toBeCloseTo(80);
		const back = clampView(panBy(v, 10_000, 10_000), area, 500, 400);
		expect(back.tx + area.x0 * back.s).toBeCloseTo(500 - 80);
		expect(back.ty + area.y0 * back.s).toBeCloseTo(400 - 80);
	});

	it('leaves a view that is already in bounds alone', () => {
		const v = fitView(area, 500, 400);
		expect(clampView(v, area, 500, 400)).toEqual(v);
	});
});

describe('centreOn', () => {
	it('keeps the zoom and puts the point in the middle', () => {
		const v = centreOn({ s: 2, tx: 5, ty: 5 }, { x: 100, y: 50 }, 800, 600);
		expect(v).toEqual({ s: 2, tx: 200, ty: 200 });
		expect(toContent(v, { x: 400, y: 300 })).toEqual({ x: 100, y: 50 });
	});
});
