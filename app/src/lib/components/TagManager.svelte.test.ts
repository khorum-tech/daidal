import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TagManager from './TagManager.svelte';
import { toScene } from '@khorum/daidal-core/model';
import { SAMPLE } from '@khorum/daidal-core/fixtures';

const scene = toScene(SAMPLE);

describe('the tag manager', () => {
	it('lists every tag with its group and count, and reports each change', async () => {
		const calls: unknown[][] = [];
		await render(TagManager, {
			tags: scene.tags,
			counts: { web: 1, api: 1, data: 1, obs: 1 },
			onchange: (key, change, label, group) => calls.push(['change', key, change, label, group]),
			onfieldend: () => calls.push(['end']),
			ondelete: key => calls.push(['delete', key]),
			onadd: (label, group) => calls.push(['add', label, group])
		});
		await expect.element(page.getByLabelText('Group of Observability')).toHaveValue('Concern');

		await page.getByLabelText('Name of Web').fill('Frontend');
		await page.getByLabelText('Colour of Data').click();
		await page.getByRole('button', { name: 'More colours' }).click();
		await page.getByRole('button', { name: 'Colour #e0707c' }).click();
		await page.getByLabelText('Group of API').fill('Edge');
		await page.getByRole('button', { name: 'Delete tag Observability' }).click();
		await page.getByLabelText('New tag name').fill('Hot path');
		await page.getByRole('button', { name: 'Add tag' }).click();

		expect(calls).toEqual([
			['change', 'web', { label: 'Frontend' }, 'Rename tag', 'tagweb:label'],
			['end'],
			['change', 'data', { color: '#e0707c' }, 'Recolour tag', undefined],
			['change', 'api', { group: 'Edge' }, 'Move tag to a group', undefined],
			['delete', 'obs'],
			['add', 'Hot path', 'Layer']
		]);
	});

	it('says so when there are no tags', async () => {
		await render(TagManager, { tags: [], counts: {}, onchange: () => {}, onfieldend: () => {}, ondelete: () => {}, onadd: () => {} });
		await expect.element(page.getByText('No tags yet.')).toBeVisible();
	});

	it('offers the palette first and the rest under More colours, keeps a tag’s own colour, and leaves out what collides', async () => {
		const tags = [{ ...scene.tags[0], color: '#a9cc6a' }];
		const props = { tags, counts: {}, onchange: () => {}, onfieldend: () => {}, ondelete: () => {}, onadd: () => {} };
		const screen = await render(TagManager, props);
		await page.getByLabelText(`Colour of ${tags[0].label}`).click();
		const all = page.getByRole('group').getByRole('button', { name: /^Colour #/ });
		await expect.poll(() => all.elements().length).toBe(9);
		await page.getByRole('button', { name: 'More colours' }).click();
		await expect.poll(() => all.elements().length).toBe(39);
		await screen.rerender({ ...props, condition: 'mono' });
		await expect.poll(() => all.elements().length).toBeLessThan(39);
		await expect.element(page.getByRole('button', { name: 'Colour #a9cc6a' })).toBeVisible();
		await expect.element(page.getByText(/hard to tell apart/)).toBeVisible();
	});

	it('switches the palette, only to another one', async () => {
		const picked: string[] = [];
		await render(TagManager, { tags: scene.tags, counts: {}, onchange: () => {}, onfieldend: () => {}, ondelete: () => {}, onadd: () => {}, palette: 'nocturne', onpalette: id => picked.push(id) });
		await expect.element(page.getByRole('radio', { name: /Nocturne/ })).toHaveAttribute('aria-checked', 'true');
		await page.getByRole('radio', { name: /Nocturne/ }).click();
		await page.getByRole('radio', { name: /Accessible/ }).click();
		expect(picked).toEqual(['okabe']);
	});
});
