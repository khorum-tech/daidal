import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import MultiInspector from './MultiInspector.svelte';
import type { EdgeChange } from '@khorum-oss/daidal-core/edit';
import { toScene } from '@khorum-oss/daidal-core/model';
import type { DaidalDoc } from '../types';

const doc: DaidalDoc = {
	version: 1,
	tags: { web: { label: 'Web', color: '#fff' }, data: { label: 'Data', color: '#000' } },
	nodes: [
		{ id: 'a', name: 'Shop', type: 'web-app', tags: ['web'] },
		{ id: 'b', name: 'Orders', type: 'database', tags: ['web', 'data'] }
	],
	edges: [
		{ from: 'a', to: 'b', line: 'dashed' },
		{ from: 'b', to: 'a', line: 'dashed', showLabel: false }
	]
};
const scene = toScene(doc);

describe('the multi-select inspector', () => {
	it('counts what is picked and offers only copying when not editable', async () => {
		await render(MultiInspector, { nodes: scene.nodes, edges: scene.edges, tags: scene.tags });
		await expect.element(page.getByRole('heading', { name: '2 nodes · 2 connections' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Copy' })).toBeVisible();
		expect(page.getByRole('button', { name: /^Delete/ }).elements()).toHaveLength(0);
		expect(page.getByRole('heading', { name: 'Tags' }).elements()).toHaveLength(0);
	});

	it('shows which tags all, some or none carry, and reports a tap on one', async () => {
		const tagged: string[] = [];
		await render(MultiInspector, { nodes: scene.nodes, edges: [], tags: scene.tags, editable: true, ontag: k => tagged.push(k) });
		const web = page.getByRole('button', { name: 'Take Web off all' });
		await expect.element(web).toHaveAttribute('aria-pressed', 'true');
		const data = page.getByRole('button', { name: 'Put Data on all' });
		await expect.element(data).toMatchTextContent('1/2');
		await data.click();
		await web.click();
		expect(tagged).toEqual(['data', 'web']);
	});

	it('changes the type of all from the picker, marking a shared type', async () => {
		const types: string[] = [];
		await render(MultiInspector, { nodes: scene.nodes, edges: [], tags: [], editable: true, ontype: t => types.push(t) });
		const toggle = page.getByRole('button', { name: /Mixed types/ });
		await toggle.click();
		await page.getByRole('button', { name: 'Queue', exact: true }).first().click();
		expect(types).toEqual(['Queue']);
	});

	it('restyles every picked connection, marking what they share', async () => {
		const changes: [EdgeChange, string][] = [];
		await render(MultiInspector, { nodes: [], edges: scene.edges, tags: [], editable: true, onedges: (c, l) => changes.push([c, l]) });
		await expect.element(page.getByRole('button', { name: 'Dashed line' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('button', { name: 'Arrow at the target' })).toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Thick line' }).click();
		await page.getByRole('button', { name: 'Arrows at both ends' }).click();
		await page.getByLabelText('Show their labels on the canvas').click();
		expect(changes).toEqual([
			[{ width: 2.6 }, 'Change weight'],
			[{ direction: 'both' }, 'Change arrows'],
			[{ showLabel: true }, 'Show labels']
		]);
	});

	it('copies, duplicates, deletes and clears', async () => {
		const calls: string[] = [];
		await render(MultiInspector, {
			nodes: scene.nodes,
			edges: [],
			tags: [],
			editable: true,
			oncopy: () => calls.push('copy'),
			onduplicate: () => calls.push('duplicate'),
			ondelete: () => calls.push('delete'),
			onclear: () => calls.push('clear')
		});
		await page.getByRole('button', { name: 'Copy' }).click();
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await page.getByRole('button', { name: 'Delete 2 nodes' }).click();
		await page.getByRole('button', { name: 'Clear the pick' }).click();
		expect(calls).toEqual(['copy', 'duplicate', 'delete', 'clear']);
	});
});
