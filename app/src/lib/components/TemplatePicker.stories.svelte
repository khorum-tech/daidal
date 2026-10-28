<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TemplatePicker from './TemplatePicker.svelte';

	const { Story } = defineMeta({ title: 'Home/Template picker', component: TemplatePicker, args: { picked: null, examples: false } });
</script>

<Story name="Blank" />
<Story name="A template, with its examples" args={{ picked: 'c4container', examples: true }} />
