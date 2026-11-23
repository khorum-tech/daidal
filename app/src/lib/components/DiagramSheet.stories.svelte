<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DiagramSheet from './DiagramSheet.svelte';

	const workspaces = [
		{ id: 'p', name: 'Personal', ownerEmail: 'a@x.io', personal: true, members: ['a@x.io'], types: [], groups: [] },
		{ id: 't', name: 'Platform team', ownerEmail: 'a@x.io', personal: false, members: ['a@x.io', 'b@x.io'], types: [], groups: [] }
	];

	const { Story } = defineMeta({
		title: 'Diagram/Diagram sheet',
		component: DiagramSheet,
		args: { name: 'ledger-platform', mine: true, workspaces, here: 't', onrename: () => {}, oncopy: async () => {}, ondelete: async () => {} }
	});
</script>

<Story name="Owner" />
<Story name="Someone else's" args={{ mine: false }} />
