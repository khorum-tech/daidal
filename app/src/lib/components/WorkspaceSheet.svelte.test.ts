import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import WorkspaceSheet from './WorkspaceSheet.svelte';
import type { Workspace } from '../types';

const team: Workspace = { id: 't', name: 'Team', ownerEmail: 'owner@x.io', personal: false, members: ['owner@x.io', 'pal@x.io'], types: [] };
const noop = async () => {};

describe('the workspace sheet', () => {
	it("lets the owner rename it, add and remove members, export it and delete it, after asking", async () => {
		const calls: unknown[] = [];
		render(WorkspaceSheet, {
			workspace: team,
			me: 'owner@x.io',
			onrename: async n => void calls.push(['rename', n]),
			onadd: async e => void calls.push(['add', e]),
			onremove: async e => void calls.push(['remove', e]),
			onexport: async () => void calls.push(['export']),
			ondelete: async () => void calls.push(['delete'])
		});
		await page.getByLabelText('Name').fill('Crew');
		await page.getByLabelText('Email to add').fill(' New@X.io ');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		expect(page.getByRole('button', { name: 'Remove owner@x.io' }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Remove pal@x.io' }).click();
		await page.getByRole('button', { name: 'Export a backup' }).click();
		await page.getByRole('button', { name: 'Delete workspace…' }).click();
		await page.getByRole('button', { name: 'Delete for good' }).click();
		expect(calls).toEqual([['rename', 'Crew'], ['add', 'new@x.io'], ['remove', 'pal@x.io'], ['export'], ['delete']]);
	});

	it('shows a member who is in it, and lets them export it, but nothing more', async () => {
		render(WorkspaceSheet, { workspace: team, me: 'pal@x.io', onrename: noop, onadd: noop, onremove: noop, onexport: noop, ondelete: noop });
		await expect.element(page.getByText('Only owner@x.io can change who')).toBeVisible();
		await expect.element(page.getByText('you')).toBeVisible();
		expect(page.getByLabelText('Name').elements()).toHaveLength(0);
		expect(page.getByLabelText('Email to add').elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Delete workspace…' }).elements()).toHaveLength(0);
		await expect.element(page.getByRole('button', { name: 'Export a backup' })).toBeVisible();
	});

	it("keeps a personal workspace unshared and undeletable, and shows a failure", async () => {
		render(WorkspaceSheet, {
			workspace: { ...team, personal: true, members: ['owner@x.io'], types: [] },
			me: 'owner@x.io',
			onrename: noop,
			onadd: noop,
			onremove: noop,
			onexport: async () => {
				throw new Error('not found');
			},
			ondelete: noop
		});
		await expect.element(page.getByText('Your personal workspace is only yours.')).toBeVisible();
		expect(page.getByRole('button', { name: 'Delete workspace…' }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Export a backup' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('not found');
	});

	it('lets a member leave after asking, and never offers it to the owner', async () => {
		let left = 0;
		const r = render(WorkspaceSheet, { workspace: team, me: 'pal@x.io', onrename: noop, onadd: noop, onremove: noop, onexport: noop, ondelete: noop, onleave: async () => void left++ });
		await page.getByRole('button', { name: 'Leave this workspace…' }).click();
		await expect.element(page.getByText(/now owner@x.io's/)).toBeVisible();
		await page.getByRole('button', { name: 'Leave the workspace' }).click();
		expect(left).toBe(1);
		await r.rerender({ me: 'owner@x.io' });
		await expect.element(page.getByRole('button', { name: /Leave/ })).not.toBeInTheDocument();
	});

	it('lets a member manage the workspace’s types, when it can save them', async () => {
		const calls: unknown[] = [];
		render(WorkspaceSheet, {
			workspace: { ...team, types: [{ name: 'Billing Agent', category: 'AI', icon: 'robot' }] },
			me: 'pal@x.io',
			onrename: noop,
			onadd: noop,
			onremove: noop,
			onexport: noop,
			ondelete: noop,
			onsavetype: noop,
			onremovetype: async key => void calls.push(key)
		});
		const types = page.getByRole('region', { name: 'Types' });
		await expect.element(types.getByText('Billing Agent')).toBeVisible();
		await types.getByRole('button', { name: 'Remove Billing Agent' }).click();
		expect(calls).toEqual(['billing-agent']);
	});

	it('leaves types out when it can’t save them', async () => {
		render(WorkspaceSheet, { workspace: team, me: 'owner@x.io', onrename: noop, onadd: noop, onremove: noop, onexport: noop, ondelete: noop });
		expect(page.getByRole('region', { name: 'Types' }).elements()).toHaveLength(0);
	});
});
