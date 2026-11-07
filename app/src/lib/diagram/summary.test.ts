import { describe, expect, it } from 'vitest';
import { SAMPLE } from '../fixtures/docs';
import { NODE_H } from './model';
import { cardSummary } from './summary';

describe('cardSummary', () => {
	it('sums a document up the way the canvas lays it out', () => {
		const s = cardSummary(SAMPLE);
		expect(s).toMatchObject({ kind: 'c4', nodes: 5, edges: 4 });
		expect(s.names).toEqual(['Shop', 'Gateway', 'Orders DB', 'Collector', 'Draft — not agreed yet']);
		expect(s.boxes[0]).toEqual([60, 150, 190, NODE_H]);
		expect(s.boxes[2]).toEqual([620, 150, 190, 100]);
		expect(s.tags.length).toBeLessThanOrEqual(5);
		expect(s.frames).toHaveLength((SAMPLE.boundaries ?? []).length);
	});

	it('copes with an empty document, and leaves blank names out', () => {
		expect(cardSummary({ version: 1 })).toEqual({ kind: '', nodes: 0, edges: 0, tags: [], names: [], boxes: [], frames: [], zooms: [] });
		expect(cardSummary({ version: 1, nodes: [{ id: 'a', name: '  ', type: 'service', layout: { x: 0, y: 0 } }] }).names).toEqual([]);
	});

	it('lists each diagram its nodes zoom into once, and leaves web links out', () => {
		const s = cardSummary({
			version: 1,
			nodes: [
				{ id: 'a', name: 'A', type: 'service', links: [{ diagram: 'parts' }, { label: 'Runbook', url: 'example.com' }] },
				{ id: 'b', name: 'B', type: 'service', links: [{ diagram: 'parts', view: 'Ops' }, { diagram: 'data' }] }
			]
		});
		expect(s.zooms).toEqual(['parts', 'data']);
	});
});
