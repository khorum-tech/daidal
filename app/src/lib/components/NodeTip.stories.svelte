<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import NodeTip from './NodeTip.svelte';
	import { toScene } from '../diagram/model';
	import { SAMPLE } from '../fixtures/docs';

	const scene = toScene(SAMPLE);
	const tags = Object.fromEntries(scene.tags.map(t => [t.key, t]));

	const { Story } = defineMeta({
		title: 'Diagram/Node tip',
		component: NodeTip,
		args: {
			node: scene.nodes.find(n => n.id === 'gw')!,
			tags,
			connections: [
				{ out: false, name: 'Shop', label: 'HTTPS' },
				{ out: true, name: 'Orders DB', label: '' }
			]
		}
	});
</script>

<Story name="With notes, tags and connections" />
<Story name="Bare" args={{ node: scene.nodes.find(n => n.id === 'note')!, connections: [] }} />
