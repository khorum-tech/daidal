<script lang="ts">
	import type { SceneNode, SceneTag } from '@khorum/daidal-core/model';
	import { signatureParts } from '@khorum/daidal-core/code';
	import { keyLabel } from '@khorum/daidal-core/table';
	import Icon from './Icon.svelte';

	/**
	 * A node's detail while presenting: the prototype's hover card. Its type, name and subtitle, its notes, its tags,
	 * and a few of its connections. The page places it, beside the node on a wide screen and along the bottom on a
	 * phone. [full] is the phone's View of a selected node, in a sheet: every connection, and its links to open. The
	 * sheet is its frame and its title is the node's name, so there it draws no card of its own and no name.
	 */
	let {
		node,
		tags,
		connections,
		full = false
	}: {
		node: SceneNode;
		tags: Record<string, SceneTag>;
		/** Its connections, each with the node at the other end. */
		connections: { out: boolean; name: string; label: string }[];
		full?: boolean;
	} = $props();

	const SHOWN = 4;
	const shown = $derived(full ? connections : connections.slice(0, SHOWN));
	const hostOf = (url: string) => {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	};
</script>

<div class="tip" class:full role={full ? 'region' : 'tooltip'} aria-label="About {node.name}">
	{#if !full}<div class="glow" aria-hidden="true"></div>{/if}
	<div class="head">
		<span class="icon"><Icon name={node.icon} size={14} /></span>
		<span class="type">{node.type}</span>
	</div>
	{#if !full}<p class="name">{node.name}</p>{/if}
	{#if node.sub.trim()}<p class="sub">{node.sub}</p>{/if}
	{#if node.desc.trim()}<p class="desc">{node.desc}</p>{/if}
	{#if node.path}<p class="code">{node.path}</p>{/if}
	{#if node.members.length}
		<ul class="code members">
			{#each node.members as m, i (i)}<li>{m}</li>{/each}
		</ul>
	{/if}
	{#if node.columns.length}
		<ul class="code columns" aria-label="Columns">
			{#each node.columns as c, i (c.id ?? i)}
				{@const key = keyLabel(c.key)}
				<li>{#if key}<span class="col-key">{key}</span>{/if}<span class="fn-name">{c.name}</span>{#if c.type}<span class="col-type">{c.type}</span>{/if}</li>
			{/each}
		</ul>
	{/if}
	{#if node.functions.length}
		<ul class="code functions" aria-label="Functions">
			{#each node.functions as f, i (i)}
				{@const p = signatureParts(f, node.language)}
				<li>{p.lead}<span class="fn-name">{f.name}</span>{p.rest}{#if f.notes}<span class="fn-note">{f.notes}</span>{/if}</li>
			{/each}
		</ul>
	{/if}
	{#if node.tags.length}
		<div class="tags">
			{#each node.tags as k (k)}
				{#if tags[k]}<span class="tag"><span class="dot" style:background={tags[k].color}></span>{tags[k].label}</span>{/if}
			{/each}
		</div>
	{/if}
	{#if connections.length}
		<ul class="edges">
			{#each shown as c, i (i)}
				<li><span class="dir">{c.out ? '→' : '←'}</span><span class="other">{c.name}</span>{#if c.label}<span class="label">{c.label}</span>{/if}</li>
			{/each}
			{#if connections.length > shown.length}<li class="more">and {connections.length - shown.length} more</li>{/if}
		</ul>
	{/if}
	{#if full && node.links.length}
		<ul class="edges links" aria-label="Links">
			{#each node.links as l, i (i)}
				<li><Icon name="link" size={12} /><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label || hostOf(l.url)}</a></li>
			{/each}
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
	/* In the sheet: no box inside the sheet's own. */
	.tip.full {
		width: 100%;
		pointer-events: auto;
		/* The sheet's other contents (the node's details) keep this distance from its edges. */
		padding: 14px 16px;
		border: none;
		border-radius: 0;
		background: none;
		box-shadow: none;
	}
	.links a {
		color: var(--color-accent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.code {
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 11.5px;
		line-height: 1.6;
		color: var(--color-neutral-400);
		overflow-wrap: anywhere;
	}
	.code.members {
		color: var(--color-text);
	}
	.fn-name {
		color: var(--color-text);
	}
	.columns li {
		display: flex;
		gap: 6px;
	}
	.col-key {
		flex: none;
		width: 18px;
		font-size: 9px;
		font-weight: 700;
		color: var(--color-accent-300);
		align-self: center;
	}
	.col-type {
		margin-left: auto;
		padding-left: 8px;
	}
	.fn-note {
		display: block;
		font-family: var(--font-body);
		font-size: 11.5px;
		line-height: 1.45;
		margin-bottom: 3px;
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
