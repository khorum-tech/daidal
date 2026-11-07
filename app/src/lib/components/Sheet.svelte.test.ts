import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Sheet from './Sheet.svelte';

const content = createRawSnippet(() => ({ render: () => '<p>Sheet content</p>' }));

describe('a bottom sheet', () => {
	it('shows its content as a modal dialog only while open', async () => {
		const { rerender } = await render(Sheet, { open: false, title: 'History', onclose: () => {}, children: content });
		expect(page.getByRole('dialog').query()).toBeNull();
		await rerender({ open: true });
		await expect.element(page.getByRole('dialog', { name: 'History' })).toBeVisible();
		await expect.element(page.getByText('Sheet content')).toBeVisible();
	});

	it('asks to close from its button and from Escape', async () => {
		let closed = 0;
		await render(Sheet, { open: true, title: 'History', onclose: () => closed++, children: content });
		await page.getByRole('button', { name: 'Close History' }).click();
		expect(closed).toBe(1);
		await userEvent.keyboard('{Escape}');
		expect(closed).toBe(2);
	});
});

describe('closing from the backdrop', () => {
	it('ignores a click that did not start on the backdrop, like the one that ends the tap opening it', async () => {
		let closed = 0;
		await render(Sheet, { open: true, title: 'Details', onclose: () => closed++, children: content });
		const dialog = page.getByRole('dialog').element() as HTMLDialogElement;
		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(closed).toBe(0);
		dialog.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(closed).toBe(1);
	});
});
