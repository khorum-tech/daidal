<script lang="ts">
	import type { Workspace } from '../types';
	import Icon from './Icon.svelte';

	/**
	 * What can be done with a diagram as a whole: the owner renames or deletes it; anyone who can see it copies it into
	 * a workspace of theirs, as a duplicate (on its own from now on) or a follower (which tracks this diagram's
	 * snapshots). Copying and deleting report back by promise, so a failure shows here.
	 */
	let {
		name,
		mine,
		workspaces,
		here,
		onrename,
		oncopy,
		ondelete
	}: {
		name: string;
		mine: boolean;
		/** Where a copy can go: the workspaces the person belongs to. */
		workspaces: Workspace[];
		/** The workspace the diagram is in, chosen for a copy at first. */
		here: string;
		onrename: (name: string) => void;
		oncopy: (copy: { workspace: string; name: string; follow: boolean }) => Promise<void>;
		ondelete: () => Promise<void>;
	} = $props();

	let follow = $state(false);
	let target = $state('');
	let copyName = $state('');
	let busy = $state(false);
	let failed = $state('');
	let confirming = $state(false);
	// A fresh start whenever the sheet is shown for another diagram or name.
	let shownFor = '';
	$effect.pre(() => {
		if (shownFor === name) return;
		shownFor = name;
		target = workspaces.some(w => w.id === here) ? here : (workspaces[0]?.id ?? '');
		copyName = `${name} copy`;
		failed = '';
		confirming = false;
	});

	function rename(e: Event & { currentTarget: HTMLInputElement }) {
		const to = e.currentTarget.value.trim();
		if (!to) e.currentTarget.value = name;
		else if (to !== name) onrename(to);
	}
	async function run(action: () => Promise<void>) {
		busy = true;
		failed = '';
		try {
			await action();
		} catch (e) {
			failed = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}
	function copy(e: SubmitEvent) {
		e.preventDefault();
		if (!copyName.trim() || !target) return;
		void run(() => oncopy({ workspace: target, name: copyName.trim(), follow }));
	}
</script>

<div class="diagram-sheet">
	{#if mine}
		<label class="field">
			<span>Name</span>
			<input class="input" value={name} maxlength="100" onchange={rename} onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()} />
		</label>
	{:else}
		<p class="owned">You can look at this diagram, and copy it into a workspace of yours.</p>
	{/if}

	<form class="copy" onsubmit={copy}>
		<h3>Make a copy</h3>
		<div class="kinds" role="radiogroup" aria-label="Kind of copy">
			<label class="kind" class:on={!follow}>
				<input type="radio" name="kind" checked={!follow} onchange={() => (follow = false)} />
				<span><strong>Duplicate</strong>As it is now, then on its own.</span>
			</label>
			<label class="kind" class:on={follow}>
				<input type="radio" name="kind" checked={follow} onchange={() => (follow = true)} />
				<span><strong>Follow</strong>Starts from its latest snapshot, and shows when newer ones arrive.</span>
			</label>
		</div>
		<label class="field">
			<span>Into</span>
			<select class="input" bind:value={target}>
				{#each workspaces as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
			</select>
		</label>
		<label class="field">
			<span>Called</span>
			<input class="input" maxlength="100" bind:value={copyName} />
		</label>
		<button type="submit" class="btn btn-primary" disabled={busy || !copyName.trim() || !target}>{follow ? 'Make a follower' : 'Make a duplicate'}</button>
	</form>

	{#if mine}
		<div class="danger-zone">
			{#if confirming}
				<p>Delete “{name}” and its history for good? Copies that follow it keep what they have.</p>
				<div class="row">
					<button type="button" class="btn btn-secondary danger" disabled={busy} onclick={() => run(ondelete)}><Icon name="trash" size={14} />Delete for good</button>
					<button type="button" class="btn btn-ghost" onclick={() => (confirming = false)}>Keep it</button>
				</div>
			{:else}
				<button type="button" class="btn btn-secondary" onclick={() => (confirming = true)}><Icon name="trash" size={14} />Delete diagram…</button>
			{/if}
		</div>
	{/if}

	{#if failed}<p class="error" role="alert">{failed}</p>{/if}
</div>

<style>
	.diagram-sheet {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 12px 16px 18px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		min-height: 34px;
		padding: 5px 9px;
		font-size: 13px;
	}
	select.input {
		-webkit-appearance: none;
		appearance: none;
	}
	select.input option {
		background: var(--color-surface);
		color: var(--color-text);
	}
	.owned {
		margin: 0;
		font-size: 12.5px;
		color: var(--color-neutral-400);
	}
	h3 {
		margin: 0;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
	}
	.copy {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	.kinds {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.kind {
		display: flex;
		gap: 8px;
		padding: 9px 10px;
		border-radius: 9px;
		border: 1px solid var(--color-divider);
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.kind.on {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}
	.kind input {
		accent-color: var(--color-accent);
		margin: 2px 0 0;
	}
	.kind strong {
		display: block;
		font-size: 12.5px;
		font-weight: 500;
		color: var(--color-text);
	}
	.copy .btn {
		align-self: flex-start;
		font-size: 13px;
	}
	.danger-zone {
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	.danger-zone p {
		margin: 0 0 8px;
		font-size: 12.5px;
		color: var(--color-neutral-300);
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.danger-zone .btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
	}
	.danger {
		color: var(--color-danger, #e5767b);
		border-color: currentColor;
	}
	.error {
		margin: 0;
		font-size: 12px;
		color: var(--color-danger, #e5767b);
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.input {
			font-size: 16px;
		}
	}
</style>
