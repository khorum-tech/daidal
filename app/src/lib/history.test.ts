import { describe, expect, it } from 'vitest';
import { History } from './history.svelte';
import type { SkopeDoc } from './types';

const doc = (n: number): SkopeDoc => ({ version: 1, diagram: { name: `v${n}` } });

describe('History', () => {
	it('undoes and redoes changes in order', () => {
		const h = new History();
		h.record(doc(0), 'first');
		h.record(doc(1), 'second');
		expect(h.undoLabel).toBe('second');
		expect(h.undo(doc(2))).toEqual(doc(1));
		expect(h.undo(doc(1))).toEqual(doc(0));
		expect(h.undo(doc(0))).toBeNull();
		expect(h.redoLabel).toBe('first');
		expect(h.redo(doc(0))).toEqual(doc(1));
		expect(h.redo(doc(1))).toEqual(doc(2));
		expect(h.redo(doc(2))).toBeNull();
	});

	it('forgets what could be redone once a new change is made', () => {
		const h = new History();
		h.record(doc(0), 'first');
		h.undo(doc(1));
		h.record(doc(0), 'other');
		expect(h.redoLabel).toBeNull();
	});

	it('keeps changes in one group as one step until the group ends', () => {
		const h = new History();
		h.record(doc(0), 'Rename', 'n1:name');
		h.record(doc(1), 'Rename', 'n1:name');
		h.record(doc(2), 'Rename', 'n1:name');
		expect(h.undo(doc(3))).toEqual(doc(0));
		expect(h.undo(doc(0))).toBeNull();

		h.record(doc(0), 'Rename', 'n1:name');
		h.endGroup();
		h.record(doc(1), 'Rename', 'n1:name');
		expect(h.undo(doc(2))).toEqual(doc(1));
	});

	it('starts a new step when the group changes', () => {
		const h = new History();
		h.record(doc(0), 'Rename', 'n1:name');
		h.record(doc(1), 'Edit subtitle', 'n1:subtitle');
		expect(h.undoLabel).toBe('Edit subtitle');
		expect(h.undo(doc(2))).toEqual(doc(1));
	});

	it('keeps only the most recent steps', () => {
		const h = new History(2);
		h.record(doc(0), 'a');
		h.record(doc(1), 'b');
		h.record(doc(2), 'c');
		expect(h.undo(doc(3))).toEqual(doc(2));
		expect(h.undo(doc(2))).toEqual(doc(1));
		expect(h.undo(doc(1))).toBeNull();
	});

	it('lists every step in order, and goes to any of them one undo or redo at a time', () => {
		const h = new History();
		h.record(doc(0), 'first');
		h.record(doc(1), 'second');
		h.record(doc(2), 'third');
		expect(h.goTo(doc(3), 1)).toEqual(doc(1));
		expect(h.steps).toEqual([
			{ label: 'first', done: true },
			{ label: 'second', done: false },
			{ label: 'third', done: false }
		]);
		expect(h.redoLabel).toBe('second');
		expect(h.goTo(doc(1), 3)).toEqual(doc(3));
		expect(h.goTo(doc(3), 0)).toEqual(doc(0));
		expect(h.goTo(doc(0), 0)).toBeNull();
		expect(h.goTo(doc(0), 9)).toEqual(doc(3));
	});
});
