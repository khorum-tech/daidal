<script lang="ts">
	import type { SceneNode, SceneTag } from '../diagram/model';
	import { FLAGS } from '../diagram/icons';

	/** What a selected node holds, read-only: the prototype's inspector without its fields. */
	let { node, tags }: { node: SceneNode; tags: Record<string, SceneTag> } = $props();
</script>

<section class="inspector" aria-label="Selected node">
	<p class="type">{node.type}</p>
	<h2>{node.name}</h2>
	{#if node.sub}<p class="sub">{node.sub}</p>{/if}
	{#if node.flags.length}
		<p class="flags">{FLAGS.filter(f => node.flags.includes(f.id)).map(f => f.label).join(' · ')}</p>
	{/if}
	{#if node.tags.length}
		<ul class="tags">
			{#each node.tags as key (key)}
				<li><span class="swatch" style:background={tags[key]?.color}></span>{tags[key]?.label ?? key}</li>
			{/each}
		</ul>
	{/if}
	{#if node.desc}<p class="desc">{node.desc}</p>{/if}
	{#if node.links.length}
		<h3>Links</h3>
		<ul class="links">
			{#each node.links as l (l.url)}
				<li><a href={/^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`} target="_blank" rel="noopener noreferrer">{l.label || l.url}</a></li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.inspector {
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-divider);
	}
	.type {
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
		margin: 0;
	}
	h2 {
		font-family: var(--font-heading);
		font-size: 16px;
		font-weight: 500;
		margin: 4px 0 0;
	}
	.sub,
	.flags {
		font-size: 12px;
		color: var(--color-neutral-500);
		margin: 3px 0 0;
	}
	.flags {
		color: var(--color-accent-300);
	}
	ul {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tags li {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid var(--color-divider);
	}
	.swatch {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.desc {
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--color-neutral-300);
		margin: 12px 0 0;
		text-wrap: pretty;
	}
	h3 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 14px 0 0;
	}
	.links {
		flex-direction: column;
		gap: 4px;
		margin-top: 6px;
		font-size: 12.5px;
	}
</style>
