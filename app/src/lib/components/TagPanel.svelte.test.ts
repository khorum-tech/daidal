import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TagPanel from './TagPanel.svelte';
import { tagsOn, toScene } from '../diagram/model';
import { SAMPLE } from '../fixtures/docs';

const scene = toScene(SAMPLE);

describe('views and tags', () => {
	it('lists the views, and each group with its tags and how many nodes carry them', async () => {
		render(TagPanel, { scene, on: tagsOn(scene, null), view: null, onview: () => {}, ontoggle: () => {} });
		await expect.element(page.getByRole('button', { name: 'Everything', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('button', { name: 'Request path' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Layer' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Concern' })).toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: /Observability/ })).toBeChecked();
		await expect.element(page.getByText('API').first()).toBeVisible();
	});

	it('reports a view picked or a tag switched', async () => {
		const views: (string | null)[] = [];
		const toggled: string[] = [];
		render(TagPanel, { scene, on: tagsOn(scene, 'Request path'), view: 'Request path', onview: v => views.push(v), ontoggle: t => toggled.push(t) });
		await expect.element(page.getByRole('checkbox', { name: /Data/ })).not.toBeChecked();
		await page.getByRole('button', { name: 'Everything tagged' }).click();
		await page.getByRole('checkbox', { name: /Data/ }).click();
		expect(views).toEqual(['Everything tagged']);
		expect(toggled).toEqual(['data']);
	});

	it('says so when a diagram has no tags', async () => {
		render(TagPanel, { scene: toScene({ version: 1 }), on: {}, view: null, onview: () => {}, ontoggle: () => {} });
		await expect.element(page.getByText('This diagram has no tags.')).toBeVisible();
	});
});
