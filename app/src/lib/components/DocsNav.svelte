<script lang="ts">
	import { goto } from '$app/navigation';
	import type { DocPage } from '../docs/docs';

	/**
	 * The docs' contents: a list beside the page on a wide screen, a picker above it on a phone. [current] is the
	 * page open now (none on the contents page); [href] makes a page's address.
	 */
	let { pages, current = null, href }: { pages: DocPage[]; current?: string | null; href: (slug: string) => string } = $props();
</script>

<nav class="docs-nav" aria-label="Docs">
	<a class="all" href={href('')} aria-current={current === null ? 'page' : undefined}>All docs</a>
	<ul>
		{#each pages as p (p.slug)}
			<li><a href={href(p.slug)} aria-current={current === p.slug ? 'page' : undefined}>{p.title}</a></li>
		{/each}
	</ul>
	<label class="pick">
		<span class="sr">Go to a page</span>
		<select value={current ?? ''} onchange={e => goto(href(e.currentTarget.value))}>
			<option value="">All docs</option>
			{#each pages as p (p.slug)}<option value={p.slug}>{p.title}</option>{/each}
		</select>
	</label>
</nav>

<style>
	.docs-nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	a {
		display: block;
		padding: 6px 10px;
		border-radius: 7px;
		color: var(--color-neutral-400);
		text-decoration: none;
		font-size: 13px;
	}
	a:hover {
		color: var(--color-text);
	}
	a[aria-current='page'] {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}
	.all {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.pick {
		display: none;
	}
	.pick select {
		width: 100%;
		min-height: 40px;
		font: inherit;
		font-size: 16px;
		padding: 6px 10px;
		border-radius: 8px;
		border: 1px solid var(--color-divider);
		background: var(--color-surface, transparent);
		color: var(--color-text);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	@media (max-width: 760px) {
		ul,
		.all {
			display: none;
		}
		.pick {
			display: block;
		}
	}
</style>
