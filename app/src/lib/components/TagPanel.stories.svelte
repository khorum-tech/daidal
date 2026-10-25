<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TagPanel from './TagPanel.svelte';
	import { tagsOn, toScene } from '../diagram/model';
	import { SAMPLE } from '../fixtures/docs';

	const scene = toScene(SAMPLE);

	const { Story } = defineMeta({
		title: 'Diagram/Views and tags',
		component: TagPanel,
		args: { scene, on: tagsOn(scene, null), view: null, onview: () => {}, ontoggle: () => {} }
	});
</script>

<Story name="Everything on" />
<Story name="A view chosen" args={{ view: 'Request path', on: tagsOn(scene, 'Request path') }} />
<Story name="No tags" args={{ scene: toScene({ version: 1 }), on: {} }} />
<Story name="Editable, a view chosen" args={{ view: 'Request path', on: tagsOn(scene, 'Request path'), editable: true, onsolo: () => {} }} />
