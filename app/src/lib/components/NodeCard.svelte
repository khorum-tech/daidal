<script lang="ts">
	import type { SceneNode, SceneTag } from '../diagram/model';
	import { FLAGS, typeIcon } from '../diagram/icons';
	import Icon from './Icon.svelte';

	/** One node on the canvas, read-only. Mirrors the prototype's card and text nodes (web/index.html). */
	let {
		node,
		tags,
		ghosted = false,
		ghostOpacity = 0.22,
		selected = false,
		dragging = false,
		connecting = false,
		iconOnly = false,
		onselect,
		ondetails
	}: {
		node: SceneNode;
		tags: Record<string, SceneTag>;
		ghosted?: boolean;
		ghostOpacity?: number;
		selected?: boolean;
		dragging?: boolean;
		/** A connection is waiting for its other end: tapping this node makes it. */
		connecting?: boolean;
		/** Presenting with icon-only cards: the type's icon and the name under it. Free text stays text. */
		iconOnly?: boolean;
		onselect?: (id: string, e: MouseEvent) => void;
		ondetails?: (id: string) => void;
	} = $props();

	const first = $derived(node.tags[0] ? tags[node.tags[0]] : undefined);
	const tagTitle = $derived(node.tags.map(t => tags[t]?.label).join(' · '));
	const flags = $derived(FLAGS.filter(f => node.flags.includes(f.id)));
	const hostOf = (u: string) => {
		try {
			return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host.replace(/^www\./, '');
		} catch {
			return u;
		}
	};
	const linkTitle = $derived(node.links.map(l => l.label || hostOf(l.url)).join(' · '));
</script>

<button
	type="button"
	class="node"
	class:text={node.isText}
	class:ghost={ghosted}
	class:selected
	class:dragging
	class:connecting
	class:icon-only={iconOnly && !node.isText}
	data-node={node.id}
	style:left="{node.x}px"
	style:top="{node.y}px"
	style:width="{node.w}px"
	style:height="{node.h}px"
	style:opacity={ghosted ? ghostOpacity : 1}
	aria-pressed={selected}
	aria-label="{node.type}: {node.name}"
	onclick={e => {
		// The browser's own tap detection, so a tap works wherever a click does. Enter on the selected node (a click
		// with no pointer behind it) asks for its details.
		if (e.detail === 0 && selected) ondetails?.(node.id);
		else onselect?.(node.id, e);
	}}
>
	{#if node.isText}
		<span class="text-name">{node.name}</span>
	{:else if iconOnly}
		<span class="big-icon"><Icon name={typeIcon(node.type)} size={46} /></span>
		<span class="icon-name">{node.name}</span>
	{:else}
		<span class="head">
			<span class="type-icon"><Icon name={typeIcon(node.type)} size={15} /></span>
			<span class="type">{node.type}</span>
			<span class="badges">
				{#each flags as f (f.id)}<span title={f.label} class="flag"><Icon name={f.icon} size={11} label={f.label} /></span>{/each}
				{#if first}<span class="dot" title={tagTitle} style:background={first.color}></span>{/if}
			</span>
			{#if node.links.length}
				<span class="links" title={linkTitle}><Icon name="globe" size={11} />{node.links.length}</span>
			{/if}
		</span>
		<span class="name">{node.name}</span>
		{#if node.sub.trim()}<span class="sub">{node.sub}</span>{/if}
	{/if}
</button>

<style>
	.node {
		position: absolute;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		text-align: left;
		padding: 11px 13px;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		border: 1px solid var(--color-neutral-800);
		box-shadow: var(--shadow-sm);
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
		transition: opacity 0.25s;
	}
	.node.ghost {
		border: 1px dashed var(--color-neutral-700);
	}
	.node.selected:not(.ghost) {
		border-color: var(--color-accent);
		box-shadow:
			0 0 0 1px var(--color-accent),
			0 0 24px rgba(145, 132, 217, 0.25);
	}
	.node.dragging {
		z-index: 2;
		transition: none;
		box-shadow:
			0 0 0 1px var(--color-accent),
			0 12px 32px rgba(0, 0, 0, 0.45);
	}
	.node:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}
	.node.text {
		flex-direction: row;
		align-items: center;
		padding: 8px 10px;
		border-radius: 8px;
		background: transparent;
		border: 1px dashed transparent;
		box-shadow: none;
	}
	.node.text.selected {
		border: 1px solid var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	}
	.text-name {
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: 17px;
		line-height: 1.3;
		text-wrap: pretty;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.type-icon {
		color: var(--color-accent);
		display: flex;
	}
	.type {
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
	}
	.badges {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-accent-300);
	}
	.flag {
		display: flex;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.links {
		display: flex;
		align-items: center;
		gap: 2px;
		flex: none;
		font-size: 9.5px;
		color: var(--color-neutral-500);
	}
	.name {
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: 15px;
		margin-top: 7px;
		line-height: 1.2;
	}
	.sub {
		font-size: 11.5px;
		color: var(--color-neutral-500);
		margin-top: 3px;
	}
	.node.icon-only {
		align-items: center;
		justify-content: center;
		padding: 0;
		background: transparent;
		border-color: transparent;
		box-shadow: none;
	}
	.node.icon-only.selected:not(.ghost) {
		border-color: transparent;
		box-shadow: none;
	}
	.node.icon-only.ghost {
		border-color: transparent;
	}
	.big-icon {
		display: flex;
		color: var(--color-accent);
	}
	.node.icon-only.selected .big-icon {
		color: var(--color-accent-200);
	}
	.icon-name {
		position: absolute;
		left: -40px;
		right: -40px;
		top: calc(50% + 27px);
		text-align: center;
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: 13px;
		line-height: 1.25;
		color: var(--color-neutral-300);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.node.connecting {
		cursor: crosshair;
	}
	.node.connecting:hover {
		border-color: var(--color-accent);
	}
</style>
