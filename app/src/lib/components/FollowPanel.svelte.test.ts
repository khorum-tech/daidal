import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import FollowPanel from './FollowPanel.svelte';
import { pending, type Change } from '../diagram/review';
import type { DaidalDoc, Snapshot } from '../types';

const v1: DaidalDoc = { version: 1, nodes: [{ id: 'api', name: 'API', type: 'service', layout: { x: 0, y: 0 } }] };
const v2: DaidalDoc = {
	version: 1,
	nodes: [...v1.nodes!, { id: 'db', name: 'Orders DB', type: 'database', layout: { x: 300, y: 0 } }],
	edges: [{ from: 'api', to: 'db', label: 'SQL' }]
};
const snaps: Snapshot[] = [
	{ id: 's1', label: 'First', authorEmail: 'lead@example.com', doc: v1, createdAt: 0 },
	{ id: 's2', label: 'Add the database', authorEmail: 'lead@example.com', doc: v2, createdAt: 0 }
];
const groups = pending(snaps, 's1');
const base = { leadName: 'checkout', leadHref: '/app/d/lead', groups, decided: {}, paused: false };

describe('the follow panel', () => {
	it("lists each of the lead's new snapshots with what it changed, read-only unless editable", async () => {
		await render(FollowPanel, base);
		await expect.element(page.getByRole('heading', { name: 'Updates · 2' })).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'checkout' })).toHaveAttribute('href', '/app/d/lead');
		const group = page.getByRole('group', { name: 'Snapshot Add the database' });
		await expect.element(group.getByText('Add “Orders DB”')).toBeVisible();
		await expect.element(group.getByText('Connect API → Orders DB')).toBeVisible();
		expect(page.getByRole('button', { name: /^Accept/ }).elements()).toHaveLength(0);
	});

	it('accepts or skips one change, or all of a snapshot', async () => {
		const accepted: [string[], string][] = [];
		const skipped: string[][] = [];
		await render(FollowPanel, { ...base, editable: true, onaccept: (c: Change[], l: string) => accepted.push([c.map(x => x.id), l]), onskip: (ids: string[]) => skipped.push(ids) });
		await page.getByRole('button', { name: 'Accept Add “Orders DB”' }).click();
		await page.getByRole('button', { name: 'Skip Connect API → Orders DB' }).click();
		await page.getByRole('button', { name: 'Accept all from Add the database' }).click();
		await page.getByRole('button', { name: 'Skip all from Add the database' }).click();
		expect(accepted).toEqual([
			[['s2:na:db'], 'Accept “Add “Orders DB””'],
			[['s2:na:db', 's2:ea:api>db'], 'Accept “Add the database”']
		]);
		expect(skipped).toEqual([['s2:ea:api>db'], ['s2:na:db', 's2:ea:api>db']]);
	});

	it('shows verdicts: an accepted change can be taken back, a skipped one accepted later', async () => {
		const calls: string[] = [];
		await render(FollowPanel, {
			...base,
			editable: true,
			decided: { 's2:na:db': 'accepted', 's2:ea:api>db': 'skipped' },
			onundecide: (id: string) => calls.push(`undo ${id}`),
			onaccept: (c: Change[]) => calls.push(`accept ${c[0].id}`)
		});
		await expect.element(page.getByRole('heading', { name: 'Updates', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Take back accepting Add “Orders DB”' }).click();
		await page.getByRole('button', { name: 'Accept Connect API → Orders DB' }).click();
		expect(calls).toEqual(['undo s2:na:db', 'accept s2:ea:api>db']);
		expect(page.getByRole('button', { name: /^Skip all/ }).elements()).toHaveLength(0);
	});

	it('pauses, marks everything reviewed, and unlinks after asking', async () => {
		const calls: string[] = [];
		await render(FollowPanel, {
			...base,
			editable: true,
			onpause: (p: boolean) => calls.push(`pause ${p}`),
			onreviewed: () => calls.push('reviewed'),
			onunlink: () => calls.push('unlink')
		});
		await page.getByLabelText('Keep pulling in future updates').click();
		await page.getByRole('button', { name: 'Mark everything reviewed' }).click();
		await page.getByRole('button', { name: 'Unlink' }).click();
		await page.getByRole('group', { name: 'Stop following' }).getByRole('button', { name: 'Unlink' }).click();
		expect(calls).toEqual(['pause true', 'reviewed', 'unlink']);
	});

	it('says when it is up to date, or paused', async () => {
		await render(FollowPanel, { ...base, groups: [], paused: true });
		await expect.element(page.getByText('Up to date with checkout.')).toBeVisible();
		await expect.element(page.getByText(/Paused: what checkout changes/)).toBeVisible();
	});
});
