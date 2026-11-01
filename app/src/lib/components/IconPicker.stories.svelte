<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import IconPicker from './IconPicker.svelte';

	const { Story } = defineMeta({
		title: 'Diagram/Icon picker',
		component: IconPicker,
		args: { current: null, onpick: () => {} }
	});
</script>

<Story name="Nothing chosen" />
<Story name="Current icon marked" args={{ current: 'robot' }} />
