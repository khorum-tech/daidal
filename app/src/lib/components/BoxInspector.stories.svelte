<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BoxInspector from './BoxInspector.svelte';
	import { toScene } from '../diagram/model';
	import { SAMPLE } from '../fixtures/docs';

	const box = toScene(SAMPLE).boundaries[0];

	const { Story } = defineMeta({
		title: 'Diagram/Container inspector',
		component: BoxInspector,
		args: { box }
	});
</script>

<Story name="Read-only" />
<Story name="Editable" args={{ editable: true }} />
