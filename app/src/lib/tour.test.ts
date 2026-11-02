import { describe, expect, it } from 'vitest';
import { offerTour, practiceDoc, TOUR, tourCounts, tourOf, withTour, type TourCounts } from './tour';
import type { Me } from './types';

const me = (settings: Record<string, unknown> = {}): Me => ({ email: 'a@x.io', name: 'A', title: '', settings });
const base: TourCounts = { nodes: 1, edges: 0, boxes: 0, views: 0, tagged: 0, unnamed: 0, presenting: false };
const step = (id: string) => TOUR.find(s => s.id === id)!;

describe('the tour', () => {
	it('starts with a welcome and ends with the docs, every step titled and unique', () => {
		expect(TOUR[0].id).toBe('welcome');
		expect(TOUR.at(-1)!.id).toBe('done');
		expect(new Set(TOUR.map(s => s.id)).size).toBe(TOUR.length);
		for (const s of TOUR) expect(s.title && s.body, s.id).toBeTruthy();
	});

	it('moves on when the step is really done', () => {
		expect(step('add').done!({ ...base, nodes: 2 }, base)).toBe(true);
		expect(step('add').done!(base, base)).toBe(false);
		expect(step('name').done!({ ...base, unnamed: 0 }, { ...base, unnamed: 1 })).toBe(true);
		expect(step('name').done!({ ...base, unnamed: 1 }, { ...base, unnamed: 1 })).toBe(false);
		expect(step('connect').done!({ ...base, edges: 1 }, base)).toBe(true);
		expect(step('container').done!({ ...base, boxes: 1 }, base)).toBe(true);
		expect(step('tag').done!({ ...base, tagged: 1 }, base)).toBe(true);
		expect(step('view').done!({ ...base, views: 1 }, base)).toBe(true);
		expect(step('present').done!({ ...base, presenting: true }, base)).toBe(true);
		expect(step('welcome').done).toBeUndefined();
	});

	it('counts what the steps watch in a document', () => {
		const doc = {
			version: 1 as const,
			nodes: [
				{ id: 'a', name: 'A', type: 'service', tags: ['t'] },
				{ id: 'b', name: 'New Service', type: 'service' }
			],
			edges: [{ from: 'a', to: 'b' }],
			boundaries: [{ id: 'x' }],
			views: [{ name: 'V', tags: [] }]
		};
		expect(tourCounts(doc, true)).toEqual({ nodes: 2, edges: 1, boxes: 1, views: 1, tagged: 1, unnamed: 1, presenting: true });
		expect(tourCounts({ version: 1 })).toEqual({ ...base, nodes: 0 });
	});

	it('starts from a practice diagram with one node', () => {
		expect(practiceDoc().nodes).toHaveLength(1);
		expect(tourCounts(practiceDoc()).unnamed).toBe(0);
	});
});

describe('the tour kept in settings', () => {
	it('is offered only to someone who has never started or turned it down', () => {
		expect(offerTour(me())).toBe(true);
		expect(offerTour(me({ tutorial: { step: 0, dismissed: true } }))).toBe(false);
		expect(offerTour(me({ tutorial: { step: 3, diagram: 'd' } }))).toBe(false);
	});

	it('reads a place safely, whatever was stored', () => {
		expect(tourOf(me({ tutorial: { step: 3, diagram: 'd', done: true } }))).toEqual({ step: 3, diagram: 'd', done: true });
		expect(tourOf(me({ tutorial: { step: 99 } }))).toEqual({ step: TOUR.length - 1 });
		expect(tourOf(me({ tutorial: { step: -2, diagram: 4 } }))).toEqual({ step: 0 });
		expect(tourOf(me({ tutorial: 'x' }))).toBeNull();
		expect(tourOf(me())).toBeNull();
	});

	it('keeps the rest of the settings when it saves its place', () => {
		expect(withTour({ theme: 'dark', tutorial: { step: 1 } }, { step: 2, diagram: 'd' })).toEqual({ theme: 'dark', tutorial: { step: 2, diagram: 'd' } });
	});
});
