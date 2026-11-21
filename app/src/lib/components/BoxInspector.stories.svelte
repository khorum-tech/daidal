<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BoxInspector from './BoxInspector.svelte';
	import { toScene } from '@khorum/daidal-core/model';
	import { SAMPLE } from '@khorum/daidal-core/fixtures';

	const box = toScene(SAMPLE).boundaries[0];

	const { Story } = defineMeta({
		title: 'Diagram/Container inspector',
		component: BoxInspector,
		args: { box }
	});
</script>

<Story name="Read-only" />
<Story name="Editable" args={{ editable: true }} />
