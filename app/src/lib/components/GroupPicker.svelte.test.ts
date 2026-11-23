import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import GroupPicker from './GroupPicker.svelte';

describe('the group picker', () => {
	it('picks a group in use, none, or a new one by name, and a name in use in any case picks that group', async () => {
		const picked: (string | null)[] = [];
		await render(GroupPicker, { groups: ['Ledger C4', 'Edge'], value: 'Edge', onpick: g => picked.push(g) });
		await expect.element(page.getByRole('radio', { name: 'Edge' })).toHaveAttribute('aria-checked', 'true');
		await expect.element(page.getByRole('radio', { name: 'No group' })).toHaveAttribute('aria-checked', 'false');

		await page.getByRole('radio', { name: 'Ledger C4' }).click();
		await page.getByRole('radio', { name: 'No group' }).click();
		await expect.element(page.getByRole('button', { name: 'Add' })).toBeDisabled();
		await page.getByLabelText('New group').fill('  Payments ');
		await page.getByRole('button', { name: 'Add' }).click();
		await page.getByLabelText('New group').fill('ledger c4');
		await page.getByRole('button', { name: 'Use' }).click();
		expect(picked).toEqual(['Ledger C4', null, 'Payments', 'Ledger C4']);
	});
});
