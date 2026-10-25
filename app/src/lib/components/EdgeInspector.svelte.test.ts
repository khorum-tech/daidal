import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EdgeInspector from './EdgeInspector.svelte';
import type { EdgeChange } from '../diagram/edit';
import { toScene } from '../diagram/model';
import type { SkopeDoc } from '../types';

const doc: SkopeDoc = {
	version: 1,
	nodes: [
		{ id: 'a', name: 'Shop', type: 'web-app' },
		{ id: 'b', name: 'Gateway', type: 'api-gateway' }
	],
	edges: [{ from: 'a', to: 'b', label: 'HTTPS', anchors: { to: 'left:0.5' } }]
};
const edge = toScene(doc).edges[0];

describe('the connection inspector', () => {
	it('shows a connection read-only unless editable', async () => {
		render(EdgeInspector, { edge, fromName: 'Shop', toName: 'Gateway' });
		await expect.element(page.getByRole('heading', { name: 'Shop → Gateway' })).toBeVisible();
		await expect.element(page.getByText('HTTPS')).toBeVisible();
		expect(page.getByRole('button', { name: 'Reverse' }).elements()).toHaveLength(0);
	});

	it('reports each change with a label for undo', async () => {
		const changes: { change: EdgeChange; label: string; group?: string }[] = [];
		const calls: string[] = [];
		render(EdgeInspector, {
			edge,
			fromName: 'Shop',
			toName: 'Gateway',
			editable: true,
			onchange: (change, label, group) => changes.push({ change, label, group }),
			onfieldend: () => calls.push('end'),
			onreverse: () => calls.push('reverse'),
			ondelete: () => calls.push('delete')
		});
		await expect.element(page.getByLabelText('Label', { exact: true })).toHaveValue('HTTPS');
		// Current choices are marked: the default arrow, weight, line and route, and the pinned end.
		await expect.element(page.getByRole('button', { name: 'Arrow at the target' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('button', { name: 'Curved route' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByLabelText('Side it arrives at Gateway')).toHaveValue('left');

		await page.getByLabelText('Label', { exact: true }).fill('gRPC');
		await page.getByRole('checkbox', { name: /Show the label/ }).click();
		await page.getByRole('button', { name: 'No arrowheads' }).click();
		await page.getByRole('button', { name: 'Thin line' }).click();
		await page.getByRole('button', { name: 'Dotted line' }).click();
		await page.getByRole('button', { name: 'Straight route' }).click();
		await page.getByLabelText('Side it leaves Shop').selectOptions('bottom');
		await page.getByLabelText('Side it arrives at Gateway').selectOptions('');
		await page.getByRole('button', { name: 'Reverse' }).click();
		await page.getByRole('button', { name: 'Delete connection' }).click();

		expect(changes).toEqual([
			{ change: { label: 'gRPC' }, label: 'Edit connection label', group: 'edge0:label' },
			{ change: { showLabel: false }, label: 'Hide label', group: undefined },
			{ change: { direction: 'none' }, label: 'Change arrows', group: undefined },
			{ change: { width: 0.9 }, label: 'Change weight', group: undefined },
			{ change: { line: 'dotted' }, label: 'Change line', group: undefined },
			{ change: { route: 'straight' }, label: 'Change route', group: undefined },
			{ change: { fromSide: 'bottom' }, label: 'Pin start to the bottom', group: undefined },
			{ change: { toSide: null }, label: 'Unpin an end', group: undefined }
		]);
		expect(calls).toEqual(['end', 'reverse', 'delete']);
	});
});
