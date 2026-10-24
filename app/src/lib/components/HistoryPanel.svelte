<script lang="ts">
	import type { Snapshot } from '../types';
	import { ago } from '../time';

	/** Snapshots newest first, with the working copy on top. Picking one replays it on the canvas, read-only. */
	let {
		snapshots,
		current,
		onpick,
		now = Date.now()
	}: {
		snapshots: Snapshot[];
		/** The snapshot being replayed, or null for the working copy. */
		current: string | null;
		onpick: (id: string | null) => void;
		now?: number;
	} = $props();

	const newestFirst = $derived([...snapshots].reverse());
</script>

<section class="history" aria-label="History">
	<h2>History</h2>
	<ol>
		<li>
			<button type="button" class:active={current === null} aria-pressed={current === null} onclick={() => onpick(null)}>
				<span class="label">Working copy</span>
			</button>
		</li>
		{#each newestFirst as s (s.id)}
			<li>
				<button type="button" class:active={current === s.id} aria-pressed={current === s.id} onclick={() => onpick(s.id)}>
					<span class="label">{s.label}</span>
					<span class="meta">{s.authorEmail} · {ago(s.createdAt, now)}</span>
				</button>
			</li>
		{:else}
			<li class="empty">No snapshots yet.</li>
		{/each}
	</ol>
</section>

<style>
	.history {
		padding: 14px 12px;
	}
	h2 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 0 4px 8px;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	button {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: left;
		font: inherit;
		padding: 7px 9px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
	}
	button:hover {
		background: color-mix(in srgb, var(--color-text) 6%, transparent);
	}
	button.active {
		border-color: var(--color-accent-700);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}
	.label {
		font-size: 12.5px;
	}
	.meta {
		font-size: 10.5px;
		color: var(--color-neutral-600);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.empty {
		font-size: 12px;
		color: var(--color-neutral-600);
		padding: 0 4px;
	}
</style>
