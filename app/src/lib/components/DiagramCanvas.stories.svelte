<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import DiagramCanvas from './DiagramCanvas.svelte';
	import { tagsOn, toScene } from '../diagram/model';
	import { SAMPLE } from '../fixtures/docs';

	const scene = toScene(SAMPLE);

	const { Story } = defineMeta({
		title: 'Diagram/Canvas',
		component: DiagramCanvas,
		args: { scene, on: tagsOn(scene, null) },
		parameters: { layout: 'fullscreen' }
	});
</script>

{#snippet frame(args: ComponentProps<typeof DiagramCanvas>)}
	<div style="height:100vh"><DiagramCanvas {...args} /></div>
{/snippet}

<Story name="Everything" template={frame} />
<Story name="A view ghosts the rest" args={{ on: tagsOn(scene, 'Request path') }} template={frame} />
<Story name="Node selected" args={{ selected: 'gw' }} template={frame} />
<Story name="Straight lines" args={{ edgeStyle: 'straight' }} template={frame} />
<Story name="Empty" args={{ scene: toScene({ version: 1 }), on: {} }} template={frame} />
