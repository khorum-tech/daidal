import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TagManager from './TagManager.svelte';
import { toScene } from '../diagram/model';
import { SAMPLE } from '../fixtures/docs';

const scene = toScene(SAMPLE);

describe('the tag manager', () => {
	it('lists every tag with its group and count, and reports each change', async () => {
		const calls: unknown[][] = [];
		render(TagManager, {
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
		render(TagManager, { tags: [], counts: {}, onchange: () => {}, onfieldend: () => {}, ondelete: () => {}, onadd: () => {} });
		await expect.element(page.getByText('No tags yet.')).toBeVisible();
	});
});
