<script lang="ts">
	/**
	 * The prototype's undo history: this visit's edits, newest first, with the one the diagram is at marked. Picking
	 * an edit rolls back to just after it (or forward, to an undone one); the first row goes back to before them all.
	 * Each step on the way is an undo or redo, so ⌘Z and ⌘⇧Z carry on from there.
	 */
	let {
		steps,
		ongoto
	}: {
		/** In the order made; `done` false for the ones undone. */
		steps: { label: string; done: boolean }[];
		/** Keep the first [count] edits done. */
		ongoto: (count: number) => void;
	} = $props();

	const at = $derived(steps.filter(s => s.done).length);
	const rows = $derived(steps.map((s, i) => ({ ...s, count: i + 1 })).toReversed());
</script>

<section class="edits" aria-label="Edits">
	<h2>Edits this visit</h2>
	<ol>
		{#each rows as r (r.count)}
			<li>
				<button type="button" class:undone={!r.done} aria-current={r.count === at ? 'step' : undefined} onclick={() => ongoto(r.count)}>
					<span class="label">{r.label}</span>
					{#if r.count === at}<span class="now">Now</span>{:else if !r.done}<span class="hint">Undone</span>{/if}
				</button>
			</li>
		{/each}
		<li>
			<button type="button" class="start" aria-current={at === 0 ? 'step' : undefined} onclick={() => ongoto(0)}>
				<span class="label">As it was when opened</span>
				{#if at === 0}<span class="now">Now</span>{/if}
			</button>
		</li>
	</ol>
</section>

<style>
	.edits {
		padding: 4px 16px 14px;
	}
	h2 {
		margin: 0 0 6px;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-height: 220px;
		overflow-y: auto;
	}
	button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 12.5px;
		text-align: left;
		cursor: pointer;
	}
	button:hover {
		background: color-mix(in srgb, var(--color-text) 7%, transparent);
	}
	button[aria-current='step'] {
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}
	.undone .label {
		color: var(--color-neutral-600);
		text-decoration: line-through;
	}
	.start .label {
		color: var(--color-neutral-500);
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.now,
	.hint {
		flex: none;
		font-size: 10.5px;
		color: var(--color-accent-300);
	}
	.hint {
		color: var(--color-neutral-600);
	}
</style>
