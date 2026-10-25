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

describe('editing views and tags', () => {
	it('edits the chosen view, and offers saving the tags on now as a new one', async () => {
		const calls: unknown[][] = [];
		render(TagPanel, {
			scene,
			on: { ...tagsOn(scene, 'Request path'), data: true },
			view: 'Request path',
			onview: () => {},
			ontoggle: () => {},
			solo: null,
			onsolo: k => calls.push(['solo', k]),
			editable: true,
			onsaveview: () => calls.push(['save']),
			onrenameview: (name, to) => (calls.push(['rename', name, to]), to !== 'Everything tagged'),
			onresaveview: name => calls.push(['resave', name]),
			ondeleteview: name => calls.push(['delete', name]),
			ondefaultview: name => calls.push(['default', name]),
			onmanage: () => calls.push(['manage'])
		});
		// The chosen view is changed (Data is on as well) and is the one the diagram opens on.
		await expect.element(page.getByRole('button', { name: /^Request path/ })).toHaveTextContent(/changed.*default/);
		const editor = page.getByRole('group', { name: 'Edit view Request path' });

		await editor.getByLabelText('View name').fill('Everything tagged');
		await editor.getByLabelText('View name').element().dispatchEvent(new Event('change', { bubbles: true }));
		await expect.element(page.getByRole('alert')).toBeVisible();
		await editor.getByRole('button', { name: 'Save the tags on now' }).click();
		await editor.getByRole('checkbox', { name: /opens on this view/ }).click();
		await editor.getByRole('button', { name: 'Delete view' }).click();
		await page.getByRole('button', { name: '+ Save the tags on now as a view' }).click();
		await page.getByRole('button', { name: 'Solo Data' }).click();
		await page.getByRole('button', { name: 'Manage tags' }).click();

		expect(calls).toEqual([
			['rename', 'Request path', 'Everything tagged'],
			['resave', 'Request path'],
			['default', null],
			['delete', 'Request path'],
			['save'],
			['solo', 'data'],
			['manage']
		]);
	});
});
