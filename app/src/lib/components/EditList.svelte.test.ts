import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EditList from './EditList.svelte';

const steps = [
	{ label: 'Add service', done: true },
	{ label: 'Rename node', done: true },
	{ label: 'Delete node', done: false }
];

describe('the edit list', () => {
	it('lists edits newest first, marks where the diagram is, and goes to any of them', async () => {
		const went: number[] = [];
		render(EditList, { steps, ongoto: n => went.push(n) });
		const items = page.getByRole('listitem');
		await expect.element(items.nth(0)).toHaveTextContent(/Delete node\s*Undone/);
		await expect.element(items.nth(1)).toHaveTextContent(/Rename node\s*Now/);
		await expect.element(page.getByRole('button', { name: /Rename node/ })).toHaveAttribute('aria-current', 'step');
		await page.getByRole('button', { name: /Delete node/ }).click();
		await page.getByRole('button', { name: /Add service/ }).click();
		await page.getByRole('button', { name: /As it was when opened/ }).click();
		expect(went).toEqual([3, 1, 0]);
	});
});
