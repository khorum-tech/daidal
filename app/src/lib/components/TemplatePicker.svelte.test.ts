import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import TemplatePicker from './TemplatePicker.svelte';

describe('the template picker', () => {
	it('offers a blank canvas and each template, and the examples only for a template', async () => {
		const props = $state({ picked: null as string | null, examples: false });
		await render(TemplatePicker, props);
		const radios = page.getByRole('radio');
		await expect.poll(() => radios.elements().length).toBe(7);
		await expect.element(page.getByRole('radio', { name: /^Blank/ })).toHaveAttribute('aria-checked', 'true');
		await expect.element(page.getByRole('checkbox')).not.toBeInTheDocument();
		await page.getByRole('radio', { name: /Deployment topology/ }).click();
		await page.getByRole('checkbox', { name: /example nodes/ }).click();
		flushSync();
		await expect.element(page.getByRole('radio', { name: /Deployment topology/ })).toHaveAttribute('aria-checked', 'true');
		await expect.element(page.getByRole('checkbox', { name: /example nodes/ })).toBeChecked();
	});
});
