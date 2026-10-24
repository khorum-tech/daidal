<script lang="ts">
	import type { Diagram } from '../types';
	import { SHEET_H, SHEET_W, toScene } from '../diagram/model';
	import { ago } from '../time';
	import Icon from './Icon.svelte';

	/** A diagram in the list, as the prototype's project card: a thumbnail, its name and kind, and what it follows. */
	let {
		diagram,
		href,
		leadName = null,
		now = Date.now()
	}: { diagram: Diagram; href: string; leadName?: string | null; now?: number } = $props();

	const scene = $derived(toScene(diagram.doc));
	const dots = $derived(scene.tags.slice(0, 5).map(t => t.color));
	const meta = $derived(`${scene.nodes.length} ${scene.nodes.length === 1 ? 'node' : 'nodes'} · ${scene.edges.length} ${scene.edges.length === 1 ? 'connection' : 'connections'}`);
</script>

<a class="card" {href}>
	<span class="thumb">
		<svg viewBox="0 0 {SHEET_W} {SHEET_H}" aria-hidden="true">
			{#each scene.boundaries as b (b.id)}
				<rect x={b.x} y={b.y} width={b.w} height={b.h} rx="18" fill="none" stroke-dasharray="12 12" class="b" />
			{/each}
			{#each scene.nodes as n (n.id)}
				<rect x={n.x} y={n.y} width={n.w} height={n.h} rx="14" class="n" />
			{/each}
		</svg>
	</span>
	<span class="body">
		<span class="title">
			<span class="name">{diagram.name}</span>
			{#if scene.kind}<span class="tag tag-neutral kind">{scene.kind}</span>{/if}
		</span>
		{#if diagram.leadId}
			<span class="follows"><Icon name="follow" size={11} />{leadName ? `Follows ${leadName}` : 'Follows a diagram you can no longer see'}{diagram.paused ? ' · paused' : ''}</span>
		{/if}
		<span class="meta">
			<span>{meta}</span>
			<span class="dots">{#each dots as c, i (i)}<span style:background={c}></span>{/each}</span>
		</span>
		<span class="updated">Updated {ago(diagram.updatedAt, now)}</span>
	</span>
</a>

<style>
	.card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		overflow: hidden;
		color: var(--color-text);
		text-decoration: none;
		transition: border-color 0.15s;
	}
	.card:hover,
	.card:focus-visible {
		border-color: var(--color-neutral-600);
		color: var(--color-text);
	}
	.thumb {
		display: block;
		height: 126px;
		border-bottom: 1px solid var(--color-divider);
		background: var(--color-bg);
	}
	.thumb svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.b {
		stroke: var(--color-neutral-800);
		stroke-width: 3;
	}
	.n {
		fill: var(--color-neutral-800);
	}
	.body {
		display: flex;
		flex-direction: column;
		padding: 12px 14px;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.name {
		font-family: var(--font-heading);
		font-size: 14.5px;
		font-weight: 500;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.kind {
		font-size: 10px;
		padding: 1px 8px;
		flex: none;
		text-transform: uppercase;
	}
	.follows {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 7px;
		font-size: 10.5px;
		color: var(--color-accent-300);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.dots {
		margin-left: auto;
		display: flex;
		gap: 4px;
	}
	.dots span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.updated {
		font-size: 11px;
		color: var(--color-neutral-600);
		margin-top: 5px;
	}
</style>
