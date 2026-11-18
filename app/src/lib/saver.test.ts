import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { Saver } from './saver.svelte';
import type { DaidalDoc } from './types';

const doc = (n: number): DaidalDoc => ({ version: 1, diagram: { name: `v${n}` } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A save that resolves when the test says so. */
function controlled() {
	const calls: { rev: number; doc: DaidalDoc; resolve: (rev: number) => void; reject: (e: unknown) => void }[] = [];
	const save = (rev: number, d: DaidalDoc) => new Promise<{ rev: number }>((res, rej) => calls.push({ rev, doc: d, resolve: r => res({ rev: r }), reject: rej }));
	return { calls, save };
}

describe('Saver', () => {
	it('saves changes made close together as one, against the loaded revision', async () => {
		const { calls, save } = controlled();
		const s = new Saver(save, 4, 600);
		s.queue(doc(1));
		s.queue(doc(2));
		expect(s.state).toBe('pending');
		await vi.advanceTimersByTimeAsync(600);
		expect(calls.map(c => [c.rev, c.doc.diagram?.name])).toEqual([[4, 'v2']]);
		expect(s.state).toBe('saving');
		calls[0].resolve(5);
		await vi.runAllTimersAsync();
		expect(s.state).toBe('saved');
		expect(s.rev).toBe(5);
	});

	it('sends a change made during a save next, with the new revision', async () => {
		const { calls, save } = controlled();
		const s = new Saver(save, 1, 10);
		s.queue(doc(1));
		await vi.advanceTimersByTimeAsync(10);
		s.queue(doc(2));
		await vi.advanceTimersByTimeAsync(10); // the timer fires while the first save is still out
		expect(calls).toHaveLength(1);
		calls[0].resolve(2);
		await vi.runAllTimersAsync();
		expect(calls.map(c => [c.rev, c.doc.diagram?.name])).toEqual([[1, 'v1'], [2, 'v2']]);
		calls[1].resolve(3);
		await vi.runAllTimersAsync();
		expect([s.state, s.rev]).toEqual(['saved', 3]);
	});

	it('stops at a conflict, and ignores changes after it', async () => {
		const { calls, save } = controlled();
		const s = new Saver(save, 1, 10);
		s.queue(doc(1));
		await vi.advanceTimersByTimeAsync(10);
		calls[0].reject(new ApiError(409, 'the diagram changed since you loaded it'));
		await vi.runAllTimersAsync();
		expect(s.state).toBe('conflict');
		s.queue(doc(2));
		await vi.runAllTimersAsync();
		expect(calls).toHaveLength(1);
	});

	it('keeps a failed change to retry, and counts it as unsaved', async () => {
		const { calls, save } = controlled();
		const s = new Saver(save, 1, 10);
		s.queue(doc(1));
		await vi.advanceTimersByTimeAsync(10);
		calls[0].reject(new TypeError('Failed to fetch'));
		await vi.runAllTimersAsync();
		expect([s.state, s.unsaved]).toEqual(['error', true]);
		void s.flush();
		expect(calls[1].doc.diagram?.name).toBe('v1');
		calls[1].resolve(2);
		await vi.runAllTimersAsync();
		expect([s.state, s.unsaved]).toEqual(['saved', false]);
	});

	it('waits and tries the same save again when the server says to slow down', async () => {
		const { calls, save } = controlled();
		const s = new Saver(save, 3, 10, 1000);
		s.queue(doc(1));
		await vi.advanceTimersByTimeAsync(10);
		calls[0].reject(new ApiError(429, 'Too many changes at once; wait a moment and try again.'));
		await vi.advanceTimersByTimeAsync(0);
		expect(s.state).toBe('pending');
		expect(s.unsaved).toBe(true);
		await vi.advanceTimersByTimeAsync(999);
		expect(calls).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls.map(c => [c.rev, c.doc.diagram?.name])).toEqual([[3, 'v1'], [3, 'v1']]);
		calls[1].resolve(4);
		await vi.runAllTimersAsync();
		expect(s.state).toBe('saved');
	});
});
