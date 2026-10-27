<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProfileSheet from './ProfileSheet.svelte';
	import { DEFAULTS } from '../appearance.svelte';

	const { Story } = defineMeta({
		title: 'App/Profile and appearance',
		component: ProfileSheet,
		args: {
			me: { email: 'ada@example.com', name: 'Ada Lovelace', title: 'Platform engineer', settings: {} },
			settings: DEFAULTS,
			light: false,
			onchange: () => {},
			onsave: async () => {}
		}
	});
</script>

<Story name="Profile" />
<Story name="Appearance" args={{ tab: 'appearance' }} />
<Story name="Simulating deuteranopia" args={{ tab: 'appearance', settings: { ...DEFAULTS, condition: 'deuter', simulate: true } }} />
