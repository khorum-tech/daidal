<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AccessTokens from './AccessTokens.svelte';

	const workspaces = [
		{ id: 'p', name: 'Personal', ownerEmail: 'a@x.io', personal: true, members: ['a@x.io'], types: [] },
		{ id: 't', name: 'Platform team', ownerEmail: 'a@x.io', personal: false, members: ['a@x.io'], types: [] }
	];
	const tokens = [
		{ id: 'k1', name: 'Claude on my laptop', scope: 'write' as const, workspaces: null, createdAt: '2026-10-20T10:00:00Z', lastUsedAt: '2026-10-31T09:00:00Z' },
		{ id: 'k2', name: 'Reporting script', scope: 'read' as const, workspaces: ['t'], createdAt: '2026-10-01T10:00:00Z', lastUsedAt: null }
	];
	const made = async (body: { name: string; scope: 'read' | 'write'; workspaces?: string[] }) => ({
		...tokens[0],
		id: 'new',
		name: body.name,
		scope: body.scope,
		token: 'skt_EXAMPLEexampleEXAMPLEexampleEXAMPLEexample0'
	});

	const { Story } = defineMeta({
		title: 'Account/AI access',
		component: AccessTokens,
		args: { workspaces, origin: 'https://skope.khorum-oss.org', list: async () => tokens, create: made, revoke: async () => {} }
	});
</script>

<Story name="Online" />
<Story name="On this computer" args={{ origin: 'http://localhost:8787' }} />
<Story name="No tokens yet" args={{ list: async () => [] }} />
