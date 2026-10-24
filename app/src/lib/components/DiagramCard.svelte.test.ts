import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DiagramCard from './DiagramCard.svelte';
import { SAMPLE } from '../fixtures/docs';
import type { Diagram } from '../types';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const diagram = (over: Partial<Diagram> = {}): Diagram => ({
	id: 'd1',
	workspaceId: 'w',
	ownerEmail: 'rowan@example.com',
	name: 'checkout',
	doc: SAMPLE,
	rev: 3,
	leadId: null,
	syncedSnapshotId: null,
	decided: {},
	paused: false,
	updatedAt: NOW - 3 * 3_600_000,
	...over
});

describe('a diagram in the list', () => {
	it('links to the diagram and sums it up', async () => {
		render(DiagramCard, { diagram: diagram(), href: '/app/d/d1', now: NOW });
		await expect.element(page.getByRole('link', { name: /checkout/ })).toHaveAttribute('href', '/app/d/d1');
		await expect.element(page.getByText('5 nodes · 4 connections')).toBeVisible();
		await expect.element(page.getByText('Updated 3h ago')).toBeVisible();
		await expect.element(page.getByText('c4')).toBeVisible();
	});

	it('says what it follows, or that the lead is out of reach', async () => {
		const { rerender } = render(DiagramCard, { diagram: diagram({ leadId: 'l', paused: true }), href: '#', leadName: 'checkout-lead', now: NOW });
		await expect.element(page.getByText('Follows checkout-lead · paused')).toBeVisible();
		await rerender({ leadName: null });
		await expect.element(page.getByText(/Follows a diagram you can no longer see/)).toBeVisible();
	});
});
