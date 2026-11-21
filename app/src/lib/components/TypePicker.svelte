<script lang="ts">
	import { TYPE_CATS, typeIcon, type TypeCats } from '@khorum/daidal-core/icons';
	import { commonTypes, kindOf, type Kind } from '@khorum/daidal-core/kinds';
	import Icon from './Icon.svelte';

	/**
	 * The prototype's type picker: the diagram kind's common types first, and the whole catalogue behind a search
	 * field. [current] is marked; picking one calls [onpick] with its display name. [cats] is the workspace's
	 * catalogue, its own types merged into the built-in ones; [kind] picks which types come first.
	 */
	let {
		current = null,
		onpick,
		autofocus = false,
		cats = TYPE_CATS,
		kind = kindOf('')
	}: { current?: string | null; onpick: (type: string) => void; autofocus?: boolean; cats?: TypeCats; kind?: Kind } = $props();

	const known = $derived(new Set(cats.flatMap(c => c.items.map(([label]) => label))));
	const common = $derived(commonTypes(kind, t => known.has(t)));

	let q = $state('');
	const query = $derived(q.trim().toLowerCase());
	const groups = $derived(
		cats.map(c => ({ cat: c.cat, items: c.items.map(([label]) => label).filter(l => !query || l.toLowerCase().includes(query)) })).filter(g => g.items.length)
	);
	let search = $state<HTMLInputElement>();
	$effect(() => {
		if (autofocus) search?.focus();
	});
</script>

{#snippet option(label: string)}
	<button type="button" class="opt" class:active={current === label} aria-pressed={current === label} onclick={() => onpick(label)}>
		<Icon name={typeIcon(label, cats)} size={14} />
		<span>{label}</span>
	</button>
{/snippet}

<div class="picker">
	<input bind:this={search} class="input" type="search" placeholder="Search all types…" aria-label="Search all types" bind:value={q} />
	{#if !query}
		<p class="cat">Common{kind.id === 'freeform' ? '' : ` in ${kind.label}`}</p>
		<div class="grid">
			{#each common as label (label)}{@render option(label)}{/each}
		</div>
	{/if}
	{#each groups as g (g.cat)}
		<p class="cat">{g.cat}</p>
		<div class="grid">
			{#each g.items as label (label)}{@render option(label)}{/each}
		</div>
	{:else}
		<p class="none">No type matches “{q.trim()}”.</p>
	{/each}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		min-height: 32px;
		font-size: 13px;
	}
	.cat {
		margin: 6px 0 0;
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 5px;
	}
	.opt {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		min-height: 34px;
		padding: 5px 8px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-300);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}
	.opt span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.opt :global(svg) {
		color: var(--color-accent);
	}
	.opt:hover {
		border-color: var(--color-accent-700);
	}
	.opt.active {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		color: var(--color-accent-100);
	}
	.none {
		margin: 6px 0;
		font-size: 12px;
		color: var(--color-neutral-500);
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.input {
			font-size: 16px;
		}
	}
</style>
