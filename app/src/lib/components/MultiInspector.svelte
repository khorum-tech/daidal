<script lang="ts">
	import type { SceneEdge, SceneNode, SceneTag } from '@khorum/daidal-core/model';
	import type { EdgeChange } from '@khorum/daidal-core/edit';
	import Icon from './Icon.svelte';
	import TypePicker from './TypePicker.svelte';

	/**
	 * Many picked at once: the prototype's multi-select inspector. Changes apply to every picked node or connection
	 * as one undo step. A tag chip shows whether all, some or none of the nodes carry it; a tap puts it on all, or
	 * takes it off when all have it. Copy, duplicate and delete work on the whole pick.
	 */
	let {
		nodes,
		edges,
		tags,
		editable = false,
		ontype,
		ontag,
		onedges,
		oncopy,
		onduplicate,
		ondelete,
		onclear
	}: {
		nodes: SceneNode[];
		edges: SceneEdge[];
		tags: SceneTag[];
		editable?: boolean;
		ontype?: (type: string) => void;
		ontag?: (key: string) => void;
		onedges?: (change: EdgeChange, label: string) => void;
		oncopy?: () => void;
		onduplicate?: () => void;
		ondelete?: () => void;
		onclear?: () => void;
	} = $props();

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const count = $derived([nodes.length ? plural(nodes.length, 'node') : '', edges.length ? plural(edges.length, 'connection') : ''].filter(Boolean).join(' · '));
	const sameType = $derived(nodes.length && nodes.every(n => n.type === nodes[0].type) ? nodes[0].type : null);
	const every = (fn: (e: SceneEdge) => boolean) => edges.length > 0 && edges.every(fn);
	const labelsOn = $derived(every(e => e.showLabel));

	const ARROWS: [SceneEdge['dir'], string, string][] = [
		['forward', '→', 'Arrow at the target'],
		['back', '←', 'Arrow at the source'],
		['both', '↔', 'Arrows at both ends'],
		['none', '—', 'No arrowheads']
	];
	const WIDTHS: [string, number][] = [
		['Thin', 0.9],
		['Medium', 1.4],
		['Thick', 2.6]
	];
	const STYLES: [string, SceneEdge['style'], string][] = [
		['Solid', 'solid', ''],
		['Dashed', 'dashed', '5 4'],
		['Dotted', 'dotted', '1 3']
	];
	let typing = $state(false);
</script>

{#snippet choice(active: boolean, title: string, set: () => void, body: import('svelte').Snippet)}
	<button type="button" class="opt" class:on={active} aria-pressed={active} {title} aria-label={title} onclick={set}>{@render body()}</button>
{/snippet}

<section class="inspector" aria-label="Picked">
	<p class="kind">Picked</p>
	<h2>{count}</h2>

	{#if nodes.length && editable}
		<h3>Type</h3>
		<button type="button" class="btn btn-secondary type" aria-expanded={typing} onclick={() => (typing = !typing)}>
			{sameType ?? 'Mixed types'} <span class="hint">· {typing ? 'close' : 'change all'}</span>
		</button>
		{#if typing}
			<div class="picker">
				<TypePicker
					current={sameType}
					onpick={t => {
						typing = false;
						ontype?.(t);
					}}
				/>
			</div>
		{/if}

		<h3>Tags</h3>
		{#if tags.length}
			<div class="chips">
				{#each tags as t (t.key)}
					{@const n = nodes.filter(x => x.tags.includes(t.key)).length}
					{@const all = n === nodes.length}
					<button
						type="button"
						class="chip"
						class:all
						class:some={n > 0 && !all}
						aria-pressed={all}
						aria-label="{all ? 'Take' : 'Put'} {t.label} {all ? 'off' : 'on'} all"
						title={n > 0 && !all ? `${n} of ${nodes.length} have it` : ''}
						onclick={() => ontag?.(t.key)}
					>
						<span class="dot" style:background={t.color}></span>{t.label}{#if n > 0 && !all}<span class="part">{n}/{nodes.length}</span>{/if}
					</button>
				{/each}
			</div>
		{:else}
			<p class="note">No tags yet: add them from Manage tags.</p>
		{/if}
	{/if}

	{#if edges.length && editable}
		<h3>Arrows</h3>
		<div class="row">
			{#each ARROWS as [v, glyph, title] (v)}
				{#snippet g()}{glyph}{/snippet}
				{@render choice(
					every(e => e.dir === v),
					title,
					() => onedges?.({ direction: v }, 'Change arrows'),
					g
				)}
			{/each}
		</div>
		<h3>Weight</h3>
		<div class="row">
			{#each WIDTHS as [label, w] (label)}
				{#snippet t()}{label}{/snippet}
				{@render choice(
					every(e => Math.abs(e.width - w) < 0.3),
					`${label} line`,
					() => onedges?.({ width: w }, 'Change weight'),
					t
				)}
			{/each}
		</div>
		<h3>Line</h3>
		<div class="row">
			{#each STYLES as [label, v, dash] (v)}
				{#snippet line()}
					<svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="currentColor" stroke-width="1.6" stroke-dasharray={dash || undefined} stroke-linecap="round" /></svg>
				{/snippet}
				{@render choice(
					every(e => e.style === v),
					`${label} line`,
					() => onedges?.({ line: v }, 'Change line'),
					line
				)}
			{/each}
		</div>
		<label class="switch">
			<input type="checkbox" checked={labelsOn} onchange={() => onedges?.({ showLabel: !labelsOn }, labelsOn ? 'Hide labels' : 'Show labels')} />
			Show their labels on the canvas
		</label>
	{/if}

	<div class="actions">
		{#if nodes.length}
			<button type="button" class="btn btn-secondary" onclick={() => oncopy?.()}>Copy</button>
			{#if editable}<button type="button" class="btn btn-secondary" onclick={() => onduplicate?.()}>Duplicate</button>{/if}
		{/if}
		{#if editable}
			<button type="button" class="btn btn-secondary danger" aria-label="Delete {count}" onclick={() => ondelete?.()}><Icon name="trash" size={14} />Delete</button>
		{/if}
	</div>
	<button type="button" class="btn btn-ghost clear" onclick={() => onclear?.()}>Clear the pick</button>
	{#if nodes.length}<p class="note keys">Drag any picked node to move them all. ⌘C copies, ⌘V pastes, here or in another diagram.</p>{/if}
</section>

<style>
	.inspector {
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-divider);
	}
	.kind {
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
		margin: 0;
	}
	h2 {
		font-family: var(--font-heading);
		font-size: 15px;
		font-weight: 500;
		margin: 4px 0 0;
	}
	h3 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 14px 0 0;
	}
	.type {
		width: 100%;
		margin-top: 6px;
		font-size: 12.5px;
		text-align: left;
	}
	.hint {
		color: var(--color-neutral-500);
	}
	.picker {
		margin-top: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 28px;
		padding: 2px 8px;
		border-radius: 6px;
		border: 1px dashed var(--color-neutral-700);
		background: transparent;
		color: var(--color-neutral-500);
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	.chip .dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		opacity: 0.4;
	}
	.chip.some .dot {
		opacity: 0.7;
	}
	.chip.all {
		border-style: solid;
		border-color: var(--color-divider);
		background: var(--color-neutral-900);
		color: var(--color-text);
	}
	.chip.all .dot {
		opacity: 1;
	}
	.part {
		font-size: 10px;
		color: var(--color-neutral-500);
	}
	.row {
		display: flex;
		gap: 5px;
		margin-top: 6px;
	}
	.opt {
		flex: 1;
		min-width: 0;
		min-height: 34px;
		display: grid;
		place-items: center;
		padding: 4px 6px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-400);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.opt:hover {
		border-color: var(--color-accent-700);
	}
	.opt.on {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		color: var(--color-accent-100);
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		font-size: 12px;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.switch input {
		accent-color: var(--color-accent);
		width: 16px;
		height: 16px;
		margin: 0;
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-top: 18px;
	}
	.actions .btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font-size: 12.5px;
		padding: 6px 8px;
		white-space: nowrap;
	}
	.danger:hover {
		color: var(--color-danger, #e5767b);
		border-color: currentColor;
	}
	.clear {
		width: 100%;
		margin-top: 8px;
		font-size: 12px;
	}
	/* A finger moves them from the menu, and has no ⌘ keys. */
	@media (pointer: coarse) {
		.keys {
			display: none;
		}
	}
	.note {
		margin: 10px 0 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
	}
</style>
