<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WorkspaceSheet from './WorkspaceSheet.svelte';

	const team = { id: 't', name: 'Platform team', ownerEmail: 'owner@x.io', personal: false, members: ['owner@x.io', 'pal@x.io'], types: [], groups: [] };
	const noop = async () => {};

	const { Story } = defineMeta({
		title: 'Home/Workspace sheet',
		component: WorkspaceSheet,
		args: { workspace: team, me: 'owner@x.io', onrename: noop, onadd: noop, onremove: noop, onexport: noop, ondelete: noop, onsavetype: noop, onremovetype: noop }
	});
</script>

<Story name="Owner" />
<Story name="Member" args={{ me: 'pal@x.io' }} />
<Story name="Personal" args={{ workspace: { ...team, name: 'Personal', personal: true, members: ['owner@x.io'], types: [], groups: [] } }} />
<Story name="With types" args={{ workspace: { ...team, types: [{ name: 'Billing Agent', category: 'AI', icon: 'robot' }] } }} />
