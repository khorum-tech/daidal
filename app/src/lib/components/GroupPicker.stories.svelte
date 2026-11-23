<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import GroupPicker from './GroupPicker.svelte';

	const { Story } = defineMeta({
		title: 'Home/Group picker',
		component: GroupPicker,
		args: { groups: ['Ledger C4', 'Edge', 'Data'], value: null, onpick: () => {} }
	});
</script>

<Story name="In no group" />
<Story name="In a group" args={{ value: 'Ledger C4' }} />
<Story name="First group" args={{ groups: [] }} />
