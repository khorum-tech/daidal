<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TypePicker from './TypePicker.svelte';

	const { Story } = defineMeta({
		title: 'Diagram/Type picker',
		component: TypePicker,
		args: { current: null, onpick: () => {} }
	});
</script>

<Story name="Nothing chosen" />
<Story name="Current type marked" args={{ current: 'Database' }} />
