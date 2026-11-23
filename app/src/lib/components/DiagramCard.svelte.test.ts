import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DiagramCard from './DiagramCard.svelte';
import { SAMPLE } from '@khorum/daidal-core/fixtures';
import { cardSummary } from '@khorum/daidal-core/summary';
import type { ListedDiagram } from '../types';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const diagram = (over: Partial<ListedDiagram> = {}): ListedDiagram => ({
	id: 'd1',
	workspaceId: 'w',
	ownerEmail: 'rowan@example.com',
	name: 'checkout',
	summary: cardSummary(SAMPLE),
	leadName: null,
	rev: 3,
	group: null,
	leadId: null,
	syncedSnapshotId: null,
	decided: {},
	paused: false,
	updatedAt: NOW - 3 * 3_600_000,
	...over
});

describe('a diagram in the list', () => {
	it('names its group only when asked to (a list not under group headings)', async () => {
		const shown = await render(DiagramCard, { diagram: diagram({ group: 'Ledger C4' }), href: '#', now: NOW });
		expect(page.getByText('Ledger C4').elements()).toHaveLength(0);
		await shown.rerender({ showGroup: true });
		await expect.element(page.getByText('Ledger C4')).toBeVisible();
	});

	it('links to the diagram and sums it up', async () => {
		await render(DiagramCard, { diagram: diagram(), href: '/app/d/d1', now: NOW });
		await expect.element(page.getByRole('link', { name: /checkout/ })).toHaveAttribute('href', '/app/d/d1');
		await expect.element(page.getByText('5 nodes · 4 connections')).toBeVisible();
		await expect.element(page.getByText('Updated 3h ago')).toBeVisible();
		await expect.element(page.getByText('c4')).toBeVisible();
	});

	it('says what it follows, or that the lead is out of reach', async () => {
		const { rerender } = await render(DiagramCard, { diagram: diagram({ leadId: 'l', leadName: 'checkout-lead', paused: true }), href: '#', now: NOW });
		await expect.element(page.getByText('Follows checkout-lead · paused')).toBeVisible();
		await rerender({ diagram: diagram({ leadId: 'l', leadName: null }) });
		await expect.element(page.getByText(/Follows a diagram you can no longer see/)).toBeVisible();
	});

	it('draws its thumbnail from the summary, and names the nodes a search found', async () => {
		const { rerender } = await render(DiagramCard, { diagram: diagram(), href: '#', search: 'gate', now: NOW });
		expect(document.querySelectorAll('svg rect.n')).toHaveLength(5);
		await expect.element(page.getByText(/^Has /)).toMatchTextContent('Has Gateway');
		await rerender({ search: 'check' });
		await expect.element(page.getByText(/^Has /)).not.toBeInTheDocument();
	});
});
