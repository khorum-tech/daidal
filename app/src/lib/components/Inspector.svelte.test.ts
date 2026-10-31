import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Inspector from './Inspector.svelte';
import type { NodeChange } from '../diagram/edit';
import { toScene } from '../diagram/model';
import { SAMPLE } from '../fixtures/docs';

const scene = toScene(SAMPLE);
const tags = Object.fromEntries(scene.tags.map(t => [t.key, t]));
const node = (id: string) => scene.nodes.find(n => n.id === id)!;

/** Render an editable inspector for [id], collecting what it reports. */
function editing(id: string) {
	const changes: { change: NodeChange; label: string; group?: string }[] = [];
	const calls: string[] = [];
	render(Inspector, {
		node: node(id),
		tags,
		editable: true,
		onchange: (change, label, group) => changes.push({ change, label, group }),
		onfieldend: () => calls.push('end'),
		ondelete: () => calls.push('delete'),
		onduplicate: () => calls.push('duplicate')
	});
	return { changes, calls };
}

describe('the inspector', () => {
	it('shows a node read-only unless editable', async () => {
		render(Inspector, { node: node('gw'), tags });
		await expect.element(page.getByRole('heading', { name: 'Gateway' })).toBeVisible();
		await expect.element(page.getByText('The one way in.')).toBeVisible();
		expect(page.getByLabelText('Name').elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Delete node' }).elements()).toHaveLength(0);
	});

	it('reports typing as one group per field, ended when the field is left', async () => {
		const { changes, calls } = editing('gw');
		await expect.element(page.getByLabelText('Name')).toHaveValue('Gateway');
		await expect.element(page.getByLabelText('Notes')).toHaveValue('The one way in.');
		await page.getByLabelText('Subtitle').fill('Envoy');
		await page.getByLabelText('Name').click();
		expect(changes).toEqual([{ change: { subtitle: 'Envoy' }, label: 'Edit subtitle', group: 'gw:subtitle' }]);
		expect(calls).toEqual(['end']);
	});

	it('gives a name left blank its type', async () => {
		const { changes } = editing('gw');
		await page.getByLabelText('Name').fill('');
		await page.getByLabelText('Notes').click();
		expect(changes.at(-1)).toEqual({ change: { name: 'API Gateway' }, label: 'Rename node', group: 'gw:name' });
	});

	it('changes the type, flags, tags and links with a tap', async () => {
		const { changes } = editing('shop');
		await page.getByRole('button', { name: 'Web App', expanded: false }).click();
		await page.getByRole('button', { name: 'Mobile App' }).click();
		await page.getByRole('button', { name: 'Cache' }).click();
		await page.getByRole('button', { name: 'Remove tag Web' }).click();
		await page.getByLabelText('Add a tag').selectOptions('Data');
		await page.getByRole('button', { name: 'Remove link Docs' }).click();
		await page.getByLabelText('Link address').fill('github.com/acme/shop');
		await page.getByRole('button', { name: 'Add link' }).click();
		expect(changes.map(c => [c.label, c.change])).toEqual([
			['Change type', { type: 'Mobile App' }],
			['Flag cache', { flags: ['cache'] }],
			['Change tags', { tags: [] }],
			['Change tags', { tags: ['web', 'data'] }],
			['Remove link', { links: [] }],
			['Add link', { links: [{ label: 'Docs', url: 'example.com/docs' }, { url: 'https://github.com/acme/shop' }] }]
		]);
	});

	it('adds a link typed but not added once focus leaves the link form, and only once', async () => {
		const { changes } = editing('gw');
		await page.getByLabelText('Link label').fill('Runbook');
		await page.getByLabelText('Link address').fill('example.com/run');
		await page.getByLabelText('Notes').click();
		await page.getByLabelText('Subtitle').click();
		expect(changes.filter(c => c.label === 'Add link').map(c => c.change)).toEqual([{ links: [{ label: 'Runbook', url: 'https://example.com/run' }] }]);
		await expect.element(page.getByLabelText('Link address')).toHaveValue('');
	});

	it('asks to duplicate or delete the node', async () => {
		const { calls } = editing('db');
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await page.getByRole('button', { name: 'Delete node' }).click();
		expect(calls).toEqual(['duplicate', 'delete']);
	});

	it('offers Isolate for a node with tags, read-only or not', async () => {
		let isolated = 0;
		render(Inspector, { node: node('gw'), tags, onisolate: () => isolated++ });
		await page.getByRole('button', { name: 'Isolate its tags' }).click();
		expect(isolated).toBe(1);
	});
});
