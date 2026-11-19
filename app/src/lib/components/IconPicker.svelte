<script lang="ts">
	import { ICON_LIBRARY, searchIcons } from '@khorum-oss/daidal-core/icons';
	import Icon from './Icon.svelte';

	/**
	 * Picks an icon from Daidal's library (packages/core/src/icon-library.json), searched by name, label and keyword. Every icon
	 * comes from the one set, so whatever is picked matches the rest of the app. [current] is marked; picking one
	 * calls [onpick] with its name.
	 */
	let { current = null, onpick, autofocus = false }: { current?: string | null; onpick: (icon: string) => void; autofocus?: boolean } = $props();

	let q = $state('');
	const found = $derived(searchIcons(q));
	let search = $state<HTMLInputElement>();
	$effect(() => {
		if (autofocus) search?.focus();
	});
</script>

<div class="picker">
	<input bind:this={search} class="input" type="search" placeholder="Search icons…" aria-label="Search icons" bind:value={q} />
	<div class="grid" role="group" aria-label="Icons">
		{#each found as name (name)}
			<button
				type="button"
				class="opt"
				class:active={current === name}
				aria-pressed={current === name}
				aria-label={ICON_LIBRARY[name].label}
				title={ICON_LIBRARY[name].label}
				onclick={() => onpick(name)}
			>
				<Icon {name} size={20} />
			</button>
		{:else}
			<p class="none">No icon matches “{q.trim()}”.</p>
		{/each}
	</div>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		min-height: 32px;
		font-size: 13px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
		gap: 4px;
		max-height: 260px;
		overflow-y: auto;
	}
	.opt {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		min-height: 40px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-300);
		cursor: pointer;
	}
	.opt:hover {
		border-color: var(--color-accent-700);
		color: var(--color-accent);
	}
	.opt.active {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		color: var(--color-accent);
	}
	.none {
		grid-column: 1 / -1;
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
