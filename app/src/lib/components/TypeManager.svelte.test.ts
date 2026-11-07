import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TypeManager from './TypeManager.svelte';
import type { CustomType } from '../types';

const agent: CustomType = { name: 'Billing Agent', category: 'AI', icon: 'robot' };

async function managing(types: CustomType[] = [], fail = '') {
	const calls: unknown[] = [];
	await render(TypeManager, {
		types,
		onsave: async (key, type) => {
			if (fail) throw new Error(fail);
			calls.push(['save', key, type]);
		},
		onremove: async key => void calls.push(['remove', key])
	});
	return calls;
}

describe('the type manager', () => {
	it('adds a type with a name, a category and an icon from the library', async () => {
		const calls = await managing();
		await expect.element(page.getByText(/None yet/)).toBeVisible();
		await page.getByRole('button', { name: '+ Add a type' }).click();
		await expect.element(page.getByRole('button', { name: 'Add type' })).toBeDisabled();
		await page.getByLabelText('Name').fill(' Billing Agent ');
		await page.getByLabelText('Category').fill('AI');
		await page.getByLabelText('Search icons').fill('robot');
		await page.getByRole('button', { name: 'Robot' }).click();
		await expect.element(page.getByText('Icon: Robot')).toBeVisible();
		await page.getByRole('button', { name: 'Add type' }).click();
		expect(calls).toEqual([['save', null, agent]]);
		await expect.element(page.getByRole('button', { name: '+ Add a type' })).toBeVisible();
	});

	it('edits a type under the slug it was stored as, and removes one', async () => {
		const calls = await managing([agent]);
		await page.getByRole('button', { name: 'Edit Billing Agent' }).click();
		await expect.element(page.getByLabelText('Name')).toHaveValue('Billing Agent');
		await page.getByLabelText('Name').fill('Payments Agent');
		await page.getByRole('button', { name: 'Save type' }).click();
		await page.getByRole('button', { name: 'Remove Billing Agent' }).click();
		expect(calls).toEqual([
			['save', 'billing-agent', { ...agent, name: 'Payments Agent' }],
			['remove', 'billing-agent']
		]);
	});

	it('says when a name redraws a built-in type, and shows a failure', async () => {
		await managing([], 'this workspace already has a type called Database');
		await page.getByRole('button', { name: '+ Add a type' }).click();
		await page.getByLabelText('Name').fill('database');
		await expect.element(page.getByText('Changes how the built-in Database type looks in this workspace.')).toBeVisible();
		await page.getByLabelText('Category').fill('Data');
		await page.getByRole('button', { name: 'Add type' }).click();
		await expect.element(page.getByRole('alert')).toMatchTextContent('this workspace already has a type called Database');
	});
});
