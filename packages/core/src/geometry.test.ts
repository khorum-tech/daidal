import { describe, expect, it } from 'vitest';
import { autoSide, edgePath, endPoints, sidePoint, snapAnchor } from './geometry';
import type { SceneEdge } from './model';

const box = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });
const edge = (over: Partial<SceneEdge> = {}): SceneEdge => ({
	key: 'a>b#0',
	index: 0,
	from: 'a',
	to: 'b',
	label: '',
	showLabel: true,
	style: 'solid',
	dir: 'forward',
	width: 1.4,
	route: null,
	fromA: null,
	toA: null,
	...over
});

describe('ends', () => {
	it('picks the side facing the other box', () => {
		expect(autoSide(box(0, 0), box(300, 0))).toBe('r');
		expect(autoSide(box(300, 0), box(0, 0))).toBe('l');
		expect(autoSide(box(0, 0), box(0, 300))).toBe('b');
		expect(autoSide(box(0, 300), box(0, 0))).toBe('t');
	});

	it('places a point along a side', () => {
		expect(sidePoint(box(10, 20), 'r', 0.5)).toEqual({ x: 110, y: 45 });
		expect(sidePoint(box(10, 20), 't', 0.25)).toEqual({ x: 35, y: 20 });
	});
});

describe('edgePath', () => {
	const a = box(0, 0);
	const b = box(300, 0);

	it('curves by default, leaving room for the arrowhead at the end', () => {
		const p = edgePath(edge(), a, b);
		// Leaves a's right side with a 3px gap and arrives 10px short of b's left; the handles reach 42% of the gap.
		expect(p.d).toBe('M103,25 C181.5,25 211.5,25 290,25');
		expect(p).toMatchObject({ markerEnd: 'arr', markerStart: null, dash: '', cap: 'butt' });
	});

	it('draws straight when asked, or when the boxes are close', () => {
		expect(edgePath(edge({ route: 'straight' }), a, b).d).toBe('M103,25 L290,25');
		expect(edgePath(edge(), a, box(130, 0)).d).toBe('M103,25 L120,25');
	});

	it('routes angled lines with rounded corners and puts the label halfway along', () => {
		const p = edgePath(edge({ route: 'angled' }), a, box(300, 200));
		expect(p.d.startsWith('M103,25 L')).toBe(true);
		expect(p.d).toContain(' Q');
		expect(p.lx).toBeGreaterThan(103);
		expect(p.lx).toBeLessThan(290);
	});

	it('honours a pinned end', () => {
		const p = edgePath(edge({ fromA: { side: 'b', t: 0.25 } }), a, b);
		expect(p.d.startsWith('M25,53 ')).toBe(true);
	});

	it('dashes, dots and picks the arrowhead weight from the line width', () => {
		expect(edgePath(edge({ style: 'dashed' }), a, b).dash).toBe('5.6 4.5');
		expect(edgePath(edge({ style: 'dotted', width: 1 }), a, b)).toMatchObject({ dash: '0.01 2.4', cap: 'round', markerEnd: 'arrThin' });
		expect(edgePath(edge({ width: 2.5 }), a, b).markerEnd).toBe('arrBold');
		expect(edgePath(edge({ dir: 'both' }), a, b)).toMatchObject({ markerEnd: 'arr', markerStart: 'arrRev' });
		expect(edgePath(edge({ dir: 'none' }), a, b)).toMatchObject({ markerEnd: null, markerStart: null });
	});
});

describe('snapAnchor', () => {
	const box = { x: 100, y: 100, w: 200, h: 100 };
	it('picks the nearest side and how far along it', () => {
		expect(snapAnchor(box, { x: 98, y: 133 })).toEqual({ side: 'l', t: 0.33 });
		expect(snapAnchor(box, { x: 270, y: 205 })).toEqual({ side: 'b', t: 0.85 });
	});
	it('pulls onto a quarter when close, and keeps within the side', () => {
		expect(snapAnchor(box, { x: 152, y: 97 })).toEqual({ side: 't', t: 0.25 });
		expect(snapAnchor(box, { x: 320, y: 500 })).toEqual({ side: 'r', t: 1 });
	});
});

describe('endPoints', () => {
	it('puts an auto end mid-side facing the other box, and a pinned one where it is pinned', () => {
		const a = { x: 0, y: 0, w: 100, h: 50 };
		const b = { x: 300, y: 0, w: 100, h: 50 };
		const e = { fromA: null, toA: { side: 't', t: 0.25 } } as unknown as SceneEdge;
		expect(endPoints(e, a, b)).toEqual({ from: { x: 100, y: 25 }, to: { x: 325, y: 0 } });
	});
});
