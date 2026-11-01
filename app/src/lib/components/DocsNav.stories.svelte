<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DocsNav from './DocsNav.svelte';
	import { PAGES } from '../docs/docs';

	const { Story } = defineMeta({
		title: 'Docs/Contents',
		component: DocsNav,
		args: { pages: PAGES, current: null, href: (slug: string) => `/app/docs/${slug}` }
	});
</script>

<Story name="Contents page" />
<Story name="A page open" args={{ current: 'connections' }} />
