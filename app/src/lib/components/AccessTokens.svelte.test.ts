import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AccessTokens from './AccessTokens.svelte';
import type { AccessToken, Workspace } from '../types';

const workspaces: Workspace[] = [
	{ id: 'p', name: 'Personal', ownerEmail: 'a@x.io', personal: true, members: ['a@x.io'], types: [] },
	{ id: 't', name: 'Platform team', ownerEmail: 'a@x.io', personal: false, members: ['a@x.io'], types: [] }
];
const old: AccessToken = { id: 'k1', name: 'Old laptop', scope: 'read', workspaces: ['t'], createdAt: '2026-10-01T10:00:00Z', lastUsedAt: null };

async function shown(origin = 'https://skope.khorum-oss.org', tokens: AccessToken[] = [old]) {
	const calls: unknown[] = [];
	await render(AccessTokens, {
		workspaces,
		origin,
		list: async () => tokens,
		create: async body => {
			calls.push(['create', body]);
			return { id: 'k2', name: body.name, scope: body.scope, workspaces: body.workspaces ?? null, createdAt: '2026-11-01T10:00:00Z', lastUsedAt: null, token: 'skt_secret' };
		},
		revoke: async id => void calls.push(['revoke', id])
	});
	return calls;
}

describe('the access tokens tab', () => {
	it('says how to connect online, and lists tokens with what they reach', async () => {
		await shown();
		await expect.element(page.getByText('https://skope.khorum-oss.org/mcp').first()).toBeVisible();
		await expect.element(page.getByText(/sign in when it asks/)).toBeVisible();
		const list = page.getByRole('list', { name: 'Your access tokens' });
		await expect.element(list.getByText('Old laptop')).toBeVisible();
		await expect.element(list.getByText(/Platform team · made .* · never used/)).toBeVisible();
	});

	it('makes a token limited to some workspaces, shows it once, and gives the local command', async () => {
		const calls = await shown('http://localhost:8787');
		await page.getByLabelText('Name').fill(' Claude Code ');
		await page.getByRole('radio', { name: 'Read', exact: true }).click();
		await page.getByLabelText('Only some workspaces').click();
		await page.getByRole('button', { name: 'Create token' }).click();
		await expect.element(page.getByRole('alert')).toMatchTextContent('Choose at least one workspace');
		await page.getByLabelText('Platform team').click();
		await page.getByRole('button', { name: 'Create token' }).click();
		expect(calls).toEqual([['create', { name: 'Claude Code', scope: 'read', workspaces: ['t'] }]]);
		await expect.element(page.getByLabelText('Your new token')).toHaveValue('skt_secret');
		await expect.element(page.getByLabelText('Claude Code command')).toHaveValue(
			'claude mcp add --transport http daidal http://localhost:8787/mcp --header "Authorization: Bearer skt_secret"'
		);
		await page.getByRole('button', { name: 'Done' }).click();
		expect(page.getByLabelText('Your new token').elements()).toHaveLength(0);
	});

	it('revokes a token after asking', async () => {
		const calls = await shown();
		await page.getByRole('button', { name: 'Revoke Old laptop…' }).click();
		await page.getByRole('button', { name: 'Revoke “Old laptop”' }).click();
		expect(calls).toEqual([['revoke', 'k1']]);
		await expect.element(page.getByText('No access tokens yet.')).toBeVisible();
	});

	it('asks for a name', async () => {
		await shown('https://skope.khorum-oss.org', []);
		await page.getByRole('button', { name: 'Create token' }).click();
		await expect.element(page.getByRole('alert')).toMatchTextContent('Give the token a name');
	});
});
