<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TypeManager from './TypeManager.svelte';

	const noop = async () => {};
	const { Story } = defineMeta({
		title: 'Home/Type manager',
		component: TypeManager,
		args: { types: [], onsave: noop, onremove: noop }
	});
</script>

<Story name="No types yet" />
<Story
	name="Some types"
	args={{
		types: [
			{ name: 'Billing Agent', category: 'AI', icon: 'robot' },
			{ name: 'Ledger', category: 'Finance', icon: 'bank' },
			{ name: 'Database', category: 'Data', icon: 'hardDrive' }
		]
	}}
/>
