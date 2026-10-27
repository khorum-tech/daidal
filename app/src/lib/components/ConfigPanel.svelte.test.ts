import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ConfigPanel from './ConfigPanel.svelte';
import type { SkopeDoc } from '../types';

const doc: SkopeDoc = {
	version: 1,
	diagram: { name: 'checkout' },
	nodes: [
		{ id: 'api', name: 'API', type: 'service', layout: { x: 0, y: 0 } },
		{ id: 'db', name: 'Orders DB', type: 'database', layout: { x: 300, y: 0 } }
	],
	edges: [{ from: 'api', to: 'db' }]
};
const area = () => page.getByLabelText('Config text');

describe('the config panel', () => {
	it('shows the diagram as YAML or JSON, and only copying and downloading when read-only', async () => {
		const got: [string, string][] = [];
		render(ConfigPanel, { doc, ondownload: (text: string, lang: string) => got.push([lang, text]) });
		await expect.element(area()).toHaveValue(expect.stringContaining('# checkout: a Skope diagram config'));
		await expect.element(area()).toHaveAttribute('readonly');
		await page.getByRole('radio', { name: 'JSON' }).click();
		await expect.element(area()).toHaveValue(expect.stringMatching(/^\{\n {2}"version": 1/));
		await page.getByRole('button', { name: 'Download .skope.json' }).click();
		expect(got[0][0]).toBe('json');
		expect(JSON.parse(got[0][1])).toEqual(doc);
		expect(page.getByRole('button', { name: 'Apply' }).elements()).toHaveLength(0);
	});

	it('applies an edit, replacing or merging, and says what it did', async () => {
		const applied: [SkopeDoc, string, string][] = [];
		render(ConfigPanel, { doc, editable: true, onapply: (next: SkopeDoc, mode: string, summary: string) => applied.push([next, mode, summary]) });
		await expect.element(page.getByRole('button', { name: 'Apply' })).toBeDisabled();
		await area().fill((area().element() as HTMLTextAreaElement).value.replace('name: Orders DB', 'name: Ledger'));
		await page.getByRole('button', { name: 'Apply' }).click();
		expect(applied[0][0].nodes![1].name).toBe('Ledger');
		expect(applied[0][1]).toBe('replace');
		await expect.element(page.getByRole('status')).toHaveTextContent('Replaced with 2 nodes');

		await page.getByLabelText('Merge it in').click();
		await area().fill('nodes:\n  - id: q\n    name: Events');
		await userEvent.keyboard('{Control>}s{/Control}');
		expect(applied[1][1]).toBe('merge');
		expect(applied[1][0].nodes!.map(n => n.id)).toEqual(['api', 'db', 'q']);
	});

	it('says why a config cannot be read, changes nothing, and reverts', async () => {
		const applied: unknown[] = [];
		render(ConfigPanel, { doc, editable: true, onapply: () => applied.push(1) });
		await area().fill('nodes:\n  - id: a\n   oops');
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Line 3: Expected “key: value”');
		expect(applied).toEqual([]);
		await page.getByRole('button', { name: 'Revert' }).click();
		await expect.element(area()).toHaveValue(expect.stringContaining('name: Orders DB'));
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('opens a file into the editor to check before applying', async () => {
		render(ConfigPanel, { doc, editable: true, onapply: () => {} });
		const file = new File([JSON.stringify({ nodes: [{ id: 'x', name: 'From a file' }] })], 'other.skope.json', { type: 'application/json' });
		await userEvent.upload(page.getByLabelText('Config file to open'), file);
		await expect.element(area()).toHaveValue(expect.stringContaining('From a file'));
		await expect.element(page.getByRole('radio', { name: 'JSON' })).toHaveAttribute('aria-checked', 'true');
		await expect.element(page.getByRole('status')).toHaveTextContent('Loaded other.skope.json');
	});
});
