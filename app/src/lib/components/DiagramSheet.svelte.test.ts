import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DiagramSheet from './DiagramSheet.svelte';
import type { Workspace } from '../types';

const workspaces: Workspace[] = [
	{ id: 'p', name: 'Personal', ownerEmail: 'a@x.io', personal: true, members: ['a@x.io'] },
	{ id: 't', name: 'Platform team', ownerEmail: 'a@x.io', personal: false, members: ['a@x.io', 'b@x.io'] }
];

describe('the diagram sheet', () => {
	it('lets the owner rename, copy and delete, after asking', async () => {
		const calls: unknown[] = [];
		render(DiagramSheet, {
			name: 'ledger',
			mine: true,
			workspaces,
			here: 't',
			onrename: n => calls.push(['rename', n]),
			oncopy: async c => void calls.push(['copy', c]),
			ondelete: async () => void calls.push(['delete'])
		});
		await page.getByLabelText('Name').fill('ledger-core');
		await expect.element(page.getByLabelText('Into')).toHaveValue('t');
		await expect.element(page.getByLabelText('Called')).toHaveValue('ledger copy');
		await page.getByRole('radio', { name: /Follow/ }).click();
		await page.getByLabelText('Into').selectOptions('Personal');
		await page.getByRole('button', { name: 'Make a follower' }).click();
		await page.getByRole('button', { name: 'Delete diagram…' }).click();
		await page.getByRole('button', { name: 'Delete for good' }).click();
		expect(calls).toEqual([['rename', 'ledger-core'], ['copy', { workspace: 'p', name: 'ledger copy', follow: true }], ['delete']]);
	});

	it('only offers a copy to someone who does not own the diagram, and shows a failure', async () => {
		render(DiagramSheet, {
			name: 'ledger',
			mine: false,
			workspaces,
			here: 'elsewhere',
			onrename: () => {},
			oncopy: async () => {
				throw new Error('workspace not found');
			},
			ondelete: async () => {}
		});
		expect(page.getByLabelText('Name').elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Delete diagram…' }).elements()).toHaveLength(0);
		await expect.element(page.getByLabelText('Into')).toHaveValue('p');
		await page.getByRole('button', { name: 'Make a duplicate' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('workspace not found');
	});
});
