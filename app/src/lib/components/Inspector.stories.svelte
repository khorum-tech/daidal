<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Inspector from './Inspector.svelte';
	import { toScene } from '@khorum-oss/daidal-core/model';
	import { SAMPLE } from '@khorum-oss/daidal-core/fixtures';

	const scene = toScene(SAMPLE);
	const tags = Object.fromEntries(scene.tags.map(t => [t.key, t]));
	const node = (id: string) => scene.nodes.find(n => n.id === id)!;

	const { Story } = defineMeta({
		title: 'Diagram/Inspector',
		component: Inspector,
		args: { node: node('shop'), tags }
	});
</script>

<Story name="Read-only" />
<Story name="Editable" args={{ editable: true }} />
<Story name="Editable, flagged database" args={{ editable: true, node: node('db') }} />
