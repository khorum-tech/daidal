import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import IconPicker from './IconPicker.svelte';

describe('the icon picker', () => {
	it('offers the node icons, marking the current one, and leaves out the app controls', async () => {
		await render(IconPicker, { current: 'robot', onpick: () => {} });
		await expect.element(page.getByRole('button', { name: 'Robot' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('button', { name: 'Database' })).toHaveAttribute('aria-pressed', 'false');
		expect(page.getByRole('button', { name: 'Trash' }).elements()).toHaveLength(0);
	});

	it('searches by keyword and reports the pick', async () => {
		const picked: string[] = [];
		await render(IconPicker, { onpick: i => picked.push(i) });
		await page.getByLabelText('Search icons').fill('artificial intelligence');
		await page.getByRole('button', { name: 'Robot' }).click();
		expect(picked).toEqual(['robot']);
		await page.getByLabelText('Search icons').fill('zzz');
		await expect.element(page.getByText('No icon matches “zzz”.')).toBeVisible();
	});
});
