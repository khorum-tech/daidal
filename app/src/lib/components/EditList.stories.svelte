<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import EditList from './EditList.svelte';

	const { Story } = defineMeta({
		title: 'Diagram/Edit list',
		component: EditList,
		args: {
			steps: [
				{ label: 'Add service', done: true },
				{ label: 'Rename node', done: true },
				{ label: 'Move node', done: true },
				{ label: 'Delete node', done: false }
			],
			ongoto: () => {}
		}
	});
</script>

<Story name="With one undone" />
<Story name="Everything undone" args={{ steps: [{ label: 'Add service', done: false }] }} />
