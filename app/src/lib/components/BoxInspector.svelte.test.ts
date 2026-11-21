import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import BoxInspector from './BoxInspector.svelte';
import type { BoundaryChange } from '@khorum/daidal-core/edit';
import { toScene } from '@khorum/daidal-core/model';

const box = toScene({ version: 1, boundaries: [{ id: 'zone', label: 'PROD', labelPosition: 'outside-tr', border: { width: 2, style: 'solid' }, layout: { x: 0, y: 0, w: 400, h: 220 } }] }).boundaries[0];

describe('the container inspector', () => {
	it('shows a container read-only unless editable', async () => {
		await render(BoxInspector, { box });
		await expect.element(page.getByRole('heading', { name: 'PROD' })).toBeVisible();
		await expect.element(page.getByText('400 × 220')).toBeVisible();
		expect(page.getByRole('button', { name: 'Delete container' }).elements()).toHaveLength(0);
	});

	it('marks the current settings and reports each change', async () => {
		const changes: { change: BoundaryChange; label: string; group?: string }[] = [];
		const calls: string[] = [];
		await render(BoxInspector, {
			box,
			editable: true,
			onchange: (change, label, group) => changes.push({ change, label, group }),
			onfieldend: () => calls.push('end'),
			onduplicate: () => calls.push('duplicate'),
			ondelete: () => calls.push('delete')
		});
		await expect.element(page.getByRole('button', { name: 'Outside' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('button', { name: 'Top right' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('checkbox', { name: /moves what's inside/ })).toBeChecked();

		await page.getByLabelText('Label').fill('STAGING');
		await page.getByRole('button', { name: 'Inside' }).click();
		await page.getByRole('button', { name: 'Bottom left' }).click();
		await page.getByRole('button', { name: 'Hairline' }).click();
		await page.getByRole('button', { name: 'Dotted border' }).click();
		await page.getByRole('checkbox', { name: /moves what's inside/ }).click();
		await page.getByRole('button', { name: 'Duplicate container' }).click();
		await page.getByRole('button', { name: 'Delete container' }).click();

		expect(changes).toEqual([
			{ change: { label: 'STAGING' }, label: 'Rename container', group: 'boxzone:label' },
			{ change: { labelPosition: 'inside-tr' }, label: 'Move container label', group: undefined },
			{ change: { labelPosition: 'outside-bl' }, label: 'Move container label', group: undefined },
			{ change: { borderWidth: 1 }, label: 'Change border', group: undefined },
			{ change: { borderStyle: 'dotted' }, label: 'Change border', group: undefined },
			{ change: { moveContents: false }, label: 'Container moves alone', group: undefined }
		]);
		expect(calls).toEqual(['end', 'duplicate', 'delete']);
	});
});
