<script lang="ts">
	import type { SceneNode, SceneTag } from '../diagram/model';
	import Icon from './Icon.svelte';

	/**
	 * A node's detail while presenting: the prototype's hover card. Its type, name and subtitle, its notes, its tags,
	 * and a few of its connections. The page places it, beside the node on a wide screen and along the bottom on a
	 * phone.
	 */
	let {
		node,
		tags,
		connections
	}: {
		node: SceneNode;
		tags: Record<string, SceneTag>;
		/** Its connections, each with the node at the other end. */
		connections: { out: boolean; name: string; label: string }[];
	} = $props();

	const SHOWN = 4;
</script>

<div class="tip" role="tooltip" aria-label="About {node.name}">
	<div class="glow" aria-hidden="true"></div>
	<div class="head">
		<span class="icon"><Icon name={node.icon} size={14} /></span>
		<span class="type">{node.type}</span>
	</div>
	<p class="name">{node.name}</p>
	{#if node.sub.trim()}<p class="sub">{node.sub}</p>{/if}
	{#if node.desc.trim()}<p class="desc">{node.desc}</p>{/if}
	{#if node.tags.length}
		<div class="tags">
			{#each node.tags as k (k)}
				{#if tags[k]}<span class="tag"><span class="dot" style:background={tags[k].color}></span>{tags[k].label}</span>{/if}
			{/each}
		</div>
	{/if}
	{#if connections.length}
		<ul class="edges">
			{#each connections.slice(0, SHOWN) as c, i (i)}
				<li><span class="dir">{c.out ? '→' : '←'}</span><span class="other">{c.name}</span>{#if c.label}<span class="label">{c.label}</span>{/if}</li>
			{/each}
			{#if connections.length > SHOWN}<li class="more">and {connections.length - SHOWN} more</li>{/if}
		</ul>
	{/if}
</div>

<style>
	.tip {
		position: relative;
		width: 286px;
		max-width: 100%;
		box-sizing: border-box;
		padding: 11px 13px 12px;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-divider);
		background: var(--color-surface);
		box-shadow: var(--shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.4));
		overflow: hidden;
		pointer-events: none;
	}
	.glow {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-bottom: 5px;
	}
	.icon {
		display: flex;
		color: var(--color-accent);
	}
	.type {
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.name {
		margin: 0;
		font-family: var(--font-heading);
		font-size: 15px;
		line-height: 1.3;
	}
	.sub {
		margin: 2px 0 0;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.desc {
		margin: 9px 0 0;
		font-size: 12px;
		line-height: 1.55;
		color: var(--color-neutral-400);
		text-wrap: pretty;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 10px;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10.5px;
		padding: 2px 7px;
		border-radius: 5px;
		background: var(--color-neutral-900);
		border: 1px solid var(--color-divider);
		color: var(--color-neutral-300);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.edges {
		list-style: none;
		margin: 11px 0 0;
		padding: 9px 0 0;
		border-top: 1px solid var(--color-divider);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.edges li {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11.5px;
		color: var(--color-neutral-300);
	}
	.dir {
		width: 14px;
		flex: none;
		color: var(--color-neutral-600);
	}
	.other {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.label {
		flex: none;
		font-size: 10px;
		color: var(--color-neutral-600);
	}
	.more {
		font-size: 10.5px;
		color: var(--color-neutral-600);
	}
</style>
