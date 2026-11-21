<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ConfigPanel from './ConfigPanel.svelte';
	import { SAMPLE } from '@khorum/daidal-core/fixtures';

	const { Story } = defineMeta({
		title: 'Diagram/Config panel',
		component: ConfigPanel,
		args: { doc: SAMPLE }
	});
</script>

<Story name="Read-only" />
<Story name="Editable" args={{ editable: true, onclose: () => {} }} />
