import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TypePicker from './TypePicker.svelte';

describe('the type picker', () => {
	it('offers the common types first, then the catalogue, marking the current one', async () => {
		render(TypePicker, { current: 'Queue', onpick: () => {} });
		await expect.element(page.getByText('Common')).toBeVisible();
		await expect.element(page.getByText('Operations')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Queue' }).first()).toHaveAttribute('aria-pressed', 'true');
	});

	it('knows the AI types', async () => {
		render(TypePicker, { onpick: () => {} });
		await expect.element(page.getByText('AI', { exact: true })).toBeVisible();
		await page.getByLabelText('Search all types').fill('mcp');
		await expect.element(page.getByRole('button', { name: 'MCP Server' })).toBeVisible();
	});

	it('narrows the catalogue as you type, and reports the pick', async () => {
		const picked: string[] = [];
		render(TypePicker, { onpick: t => picked.push(t) });
		await page.getByLabelText('Search all types').fill('gate');
		expect(page.getByText('Common').elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'API Gateway' }).click();
		expect(picked).toEqual(['API Gateway']);
		await page.getByLabelText('Search all types').fill('zzz');
		await expect.element(page.getByText('No type matches “zzz”.')).toBeVisible();
	});
});

describe('the type picker and diagram kinds', () => {
	it("offers the kind's common types first", async () => {
		const { kindOf } = await import('../diagram/kinds');
		render(TypePicker, { kind: kindOf('c4-code'), onpick: () => {} });
		await expect.element(page.getByText('Common in C4 Code')).toBeVisible();
		const first = page.getByRole('button').elements().slice(0, 5).map(b => b.textContent?.trim());
		expect(first).toEqual(['Class', 'Function', 'Table', 'File', 'Note']);
	});
});
