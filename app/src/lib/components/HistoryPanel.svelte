<script lang="ts">
	import type { Snapshot } from '../types';
	import { ago } from '../time';

	/**
	 * Snapshots newest first, with the working copy on top. Picking one replays it on the canvas, read-only. With
	 * [ontake], the owner records the working copy as a new snapshot, with a description.
	 */
	let {
		snapshots,
		current,
		onpick,
		now = Date.now(),
		ontake
	}: {
		snapshots: Snapshot[];
		/** The snapshot being replayed, or null for the working copy. */
		current: string | null;
		onpick: (id: string | null) => void;
		now?: number;
		ontake?: (label: string) => Promise<void>;
	} = $props();

	let taking = $state(false);
	let label = $state('');
	let busy = $state(false);
	let failed = $state('');
	async function take(e: SubmitEvent) {
		e.preventDefault();
		if (!label.trim() || !ontake) return;
		busy = true;
		failed = '';
		try {
			await ontake(label.trim());
			label = '';
			taking = false;
		} catch (err) {
			failed = err instanceof Error ? err.message : "Couldn't take the snapshot";
		} finally {
			busy = false;
		}
	}

	const newestFirst = $derived([...snapshots].reverse());
</script>

<section class="history" aria-label="History">
	<div class="head">
		<h2>History</h2>
		{#if ontake && !taking}
			<button type="button" class="take" onclick={() => (taking = true)}>+ Take a snapshot</button>
		{/if}
	</div>
	{#if taking}
		<form class="take-form" onsubmit={take}>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input" aria-label="Snapshot description" placeholder="Describe this snapshot…" maxlength="100" autofocus bind:value={label} />
			<div class="row">
				<button type="submit" class="btn btn-secondary" disabled={busy || !label.trim()}>Save snapshot</button>
				<button type="button" class="btn btn-ghost" onclick={() => (taking = false)}>Cancel</button>
			</div>
			<p class="note">Records the working copy as it is now. Copies that follow this diagram see it as a newer snapshot.</p>
			{#if failed}<p class="error" role="alert">{failed}</p>{/if}
		</form>
	{/if}
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
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.take {
		margin: 0 4px 8px 0;
		padding: 3px 8px;
		border: 1px dashed var(--color-neutral-700);
		border-radius: 7px;
		background: transparent;
		color: var(--color-accent);
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	.take-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0 4px 10px;
		padding: 8px;
		border: 1px solid var(--color-divider);
		border-radius: 8px;
	}
	.take-form .input {
		width: 100%;
		box-sizing: border-box;
		min-height: 32px;
		padding: 4px 8px;
		font-size: 12.5px;
	}
	.take-form .row {
		display: flex;
		gap: 6px;
	}
	.take-form .btn {
		font-size: 12px;
		padding: 4px 10px;
	}
	.note,
	.error {
		margin: 0;
		font-size: 11px;
		line-height: 1.45;
		color: var(--color-neutral-500);
	}
	.error {
		color: var(--color-danger, #e5767b);
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.take-form .input {
			font-size: 16px;
		}
	}
</style>
