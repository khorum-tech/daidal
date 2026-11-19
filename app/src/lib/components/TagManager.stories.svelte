<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TagManager from './TagManager.svelte';
	import { toScene } from '@khorum-oss/daidal-core/model';
	import { SAMPLE } from '@khorum-oss/daidal-core/fixtures';

	const scene = toScene(SAMPLE);

	const { Story } = defineMeta({
		title: 'Diagram/Tag manager',
		component: TagManager,
		args: { tags: scene.tags, counts: { web: 1, api: 1, data: 1, obs: 1 }, onchange: () => {}, onfieldend: () => {}, ondelete: () => {}, onadd: () => {} }
	});
</script>

<Story name="Some tags" />
<Story name="No tags" args={{ tags: [], counts: {} }} />
