<script lang="ts">
	import { resolve } from '$app/paths';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DocsNav from '#lib/components/DocsNav.svelte';
	import { PAGES, render } from '#lib/docs/docs.ts';

	let { data } = $props();

	const href = (slug: string) => (slug ? resolve('/docs/[[page]]', { page: slug }) : resolve('/docs/[[page]]', {}));
	const html = $derived(data.page ? render(data.page.body) : '');
	const title = $derived(data.page?.title ?? (data.slug ? 'Not found' : 'Docs'));

	// The app's page itself never scrolls (the canvas needs that), so the docs scroll in their own box: back to its
	// top whenever another page opens in it.
	let scroller = $state<HTMLElement>();
	$effect(() => {
		void data.slug;
		scroller?.scrollTo({ top: 0 });
	});
</script>

<svelte:head><title>{title} · Skope docs</title></svelte:head>

<AppHeader me={data.me} homeHref={resolve('/')} crumbs={data.slug ? [{ label: 'Docs', href: href('') }, { label: title }] : [{ label: 'Docs' }]} />

<div class="docs" bind:this={scroller} data-testid="docs-scroll">
	<aside class="side"><DocsNav pages={PAGES} current={data.page ? data.slug : null} {href} /></aside>
	<main class="main">
		{#if data.page}
			<!-- The pages are Skope's own markdown (src/lib/docs), so their HTML is trusted. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<article class="prose">{@html html}</article>
			<nav class="pager" aria-label="More docs">
				{#if data.prev}<a class="prev" href={href(data.prev.slug)}><span>Previous</span>{data.prev.title}</a>{/if}
				{#if data.next}<a class="next" href={href(data.next.slug)}><span>Next</span>{data.next.title}</a>{/if}
			</nav>
		{:else if data.slug}
			<article class="prose">
				<h1>No such page</h1>
				<p>There's no docs page called “{data.slug}”. It may have moved: pick one from the list, or start with <a href={href('getting-started')}>Getting started</a>.</p>
			</article>
		{:else}
			<article class="prose">
				<h1>Skope docs</h1>
				<p>How Skope works, from your first diagram to letting an AI edit them.</p>
			</article>
			<ul class="contents">
				{#each PAGES as p (p.slug)}
					<li>
						<a href={href(p.slug)}>
							<span class="t">{p.title}</span>
							<span class="s">{p.summary}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>

<style>
	.docs {
		display: grid;
		grid-template-columns: 220px minmax(0, 760px);
		gap: 32px;
		padding: 24px 32px 64px;
		justify-content: center;
		align-content: start;
		/* Its own scrolling box: the app's page is fixed to the screen. */
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
	}
	.side {
		position: sticky;
		top: 16px;
		align-self: start;
	}
	.prose {
		font-size: 14.5px;
		line-height: 1.7;
		color: var(--color-neutral-300);
	}
	.prose :global(h1) {
		font-family: var(--font-heading);
		font-size: 26px;
		font-weight: 500;
		color: var(--color-text);
		margin: 0 0 12px;
	}
	.prose :global(h2) {
		font-size: 17px;
		font-weight: 600;
		color: var(--color-text);
		margin: 28px 0 8px;
	}
	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 12px;
	}
	.prose :global(li) {
		margin: 4px 0;
	}
	.prose :global(a) {
		color: var(--color-accent);
	}
	.prose :global(strong) {
		color: var(--color-text);
		font-weight: 600;
	}
	.prose :global(code) {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.88em;
		padding: 1px 5px;
		border-radius: 5px;
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.prose :global(pre) {
		overflow-x: auto;
		padding: 12px 14px;
		border-radius: 9px;
		border: 1px solid var(--color-divider);
		background: color-mix(in srgb, var(--color-text) 4%, transparent);
		font-size: 12.5px;
		line-height: 1.55;
	}
	.prose :global(pre code) {
		padding: 0;
		background: none;
	}
	.prose :global(img) {
		display: block;
		max-width: 100%;
		height: auto;
		margin: 14px 0 18px;
		border-radius: 10px;
		border: 1px solid var(--color-divider);
	}
	/* Pictures of the phone are tall: keep them phone-sized. */
	.prose :global(img[src*='/phone-']) {
		max-width: min(100%, 300px);
	}
	.prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0 0 14px;
		font-size: 13.5px;
		display: block;
		overflow-x: auto;
	}
	.prose :global(th),
	.prose :global(td) {
		text-align: left;
		padding: 6px 10px;
		border-bottom: 1px solid var(--color-divider);
		vertical-align: top;
	}
	.prose :global(th) {
		color: var(--color-text);
		font-weight: 600;
	}
	.pager {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-top: 36px;
		padding-top: 16px;
		border-top: 1px solid var(--color-divider);
	}
	.pager a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 14px;
		border: 1px solid var(--color-divider);
		border-radius: 9px;
		color: var(--color-text);
		text-decoration: none;
		font-size: 14px;
		max-width: 48%;
	}
	.pager a span {
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.pager .next {
		margin-left: auto;
		text-align: right;
	}
	.contents {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 10px;
	}
	.contents a {
		display: flex;
		flex-direction: column;
		gap: 4px;
		height: 100%;
		box-sizing: border-box;
		padding: 14px;
		border: 1px solid var(--color-divider);
		border-radius: 10px;
		text-decoration: none;
	}
	.contents a:hover {
		border-color: var(--color-accent-700);
	}
	.contents .t {
		color: var(--color-text);
		font-size: 14px;
		font-weight: 500;
	}
	.contents .s {
		color: var(--color-neutral-500);
		font-size: 12.5px;
		line-height: 1.5;
	}
	@media (max-width: 760px) {
		.docs {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
			padding: 16px 16px 48px;
		}
		.side {
			position: static;
		}
	}
</style>
