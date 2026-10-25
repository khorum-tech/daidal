<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import EdgeInspector from './EdgeInspector.svelte';
	import { toScene } from '../diagram/model';
	import { SAMPLE } from '../fixtures/docs';

	const scene = toScene(SAMPLE);

	const { Story } = defineMeta({
		title: 'Diagram/Connection inspector',
		component: EdgeInspector,
		args: { edge: scene.edges[0], fromName: 'Shop', toName: 'Gateway' }
	});
</script>

<Story name="Read-only" />
<Story name="Editable" args={{ editable: true }} />
