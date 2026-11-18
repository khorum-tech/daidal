<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MultiInspector from './MultiInspector.svelte';
	import { toScene } from '@khorum-oss/daidal-core/model';
	import { SAMPLE } from '@khorum-oss/daidal-core/fixtures';

	const scene = toScene(SAMPLE);

	const { Story } = defineMeta({
		title: 'Diagram/Multi-select inspector',
		component: MultiInspector,
		args: { nodes: scene.nodes.slice(0, 3), edges: scene.edges.slice(0, 2), tags: scene.tags }
	});
</script>

<Story name="Read-only" />
<Story name="Editable" args={{ editable: true }} />
<Story name="Nodes only" args={{ editable: true, edges: [] }} />
<Story name="Connections only" args={{ editable: true, nodes: [] }} />
