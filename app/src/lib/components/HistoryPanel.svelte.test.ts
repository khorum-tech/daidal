import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import HistoryPanel from './HistoryPanel.svelte';
import type { Snapshot } from '../types';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const snap = (id: string, label: string, daysAgo: number): Snapshot => ({ id, label, authorEmail: 'rowan@example.com', doc: { version: 1 }, createdAt: NOW - daysAgo * 86_400_000 });

describe('history', () => {
	it('lists the working copy, then snapshots newest first', async () => {
		await render(HistoryPanel, { snapshots: [snap('a', 'First sketch', 20), snap('b', 'Second cut', 2)], current: null, onpick: () => {}, now: NOW });
		const buttons = page.getByRole('button').all();
		expect((await Promise.all(buttons.map(b => b.element().textContent))).map(t => t?.replace(/\s+/g, ' ').trim())).toEqual([
			'Working copy',
			'Second cut rowan@example.com · 2d ago',
			expect.stringMatching(/^First sketch rowan@example\.com · /)
		]);
		await expect.element(page.getByRole('button', { name: 'Working copy' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('reports the snapshot picked, and the working copy', async () => {
		const picked: (string | null)[] = [];
		await render(HistoryPanel, { snapshots: [snap('a', 'First sketch', 1)], current: 'a', onpick: id => picked.push(id), now: NOW });
		await expect.element(page.getByRole('button', { name: /First sketch/ })).toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Working copy' }).click();
		expect(picked).toEqual([null]);
	});

	it('says when there is no history yet', async () => {
		await render(HistoryPanel, { snapshots: [], current: null, onpick: () => {}, now: NOW });
		await expect.element(page.getByText('No snapshots yet.')).toBeVisible();
	});
});

describe('taking a snapshot', () => {
	it('records a description, and is offered only when it can be taken', async () => {
		const taken: string[] = [];
		await render(HistoryPanel, { snapshots: [], current: null, onpick: () => {}, ontake: async l => void taken.push(l) });
		await page.getByRole('button', { name: '+ Take a snapshot' }).click();
		await page.getByLabelText('Snapshot description').fill('Before the cut-over');
		await page.getByRole('button', { name: 'Save snapshot' }).click();
		expect(taken).toEqual(['Before the cut-over']);
		await expect.element(page.getByRole('button', { name: '+ Take a snapshot' })).toBeVisible();
	});

	it('is not offered without a way to take one', async () => {
		await render(HistoryPanel, { snapshots: [], current: null, onpick: () => {} });
		expect(page.getByRole('button', { name: '+ Take a snapshot' }).elements()).toHaveLength(0);
	});
});
