<script lang="ts">
	import type { Change, PendingGroup } from '../diagram/review';
	import { ago } from '../time';

	/**
	 * A follower's updates: the prototype's Updates tab. Each snapshot the lead took since the one this diagram is
	 * synced to lists what it changed; each change can be accepted (it comes into this diagram, as an undoable edit)
	 * or skipped, a whole snapshot at once too, and a verdict can be taken back. Skipped changes stay listed, so they
	 * can be pulled in later. Marking everything reviewed syncs to the lead's latest snapshot. Pausing keeps the
	 * updates out of the way; unlinking stops following altogether.
	 */
	let {
		leadName,
		leadHref,
		groups,
		decided,
		paused,
		editable = false,
		now = Date.now(),
		onaccept,
		onskip,
		onundecide,
		onpause,
		onunlink,
		onreviewed
	}: {
		leadName: string;
		leadHref: string;
		groups: PendingGroup[];
		/** Verdicts by change id: 'accepted' or 'skipped'. */
		decided: Record<string, string>;
		paused: boolean;
		editable?: boolean;
		now?: number;
		onaccept?: (changes: Change[], label: string) => void;
		onskip?: (ids: string[]) => void;
		onundecide?: (id: string) => void;
		onpause?: (paused: boolean) => void;
		onunlink?: () => void;
		onreviewed?: () => void;
	} = $props();

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const open = $derived(groups.flatMap(g => g.changes).filter(c => !decided[c.id]).length);
	let unlinking = $state(false);
</script>

<section class="follow" aria-label="Updates">
	<div class="head">
		<h2>Updates{open && !paused ? ` · ${open}` : ''}</h2>
		{#if editable && !unlinking}<button type="button" class="btn btn-ghost small" onclick={() => (unlinking = true)}>Unlink</button>{/if}
	</div>
	<p class="lead">Following <a href={leadHref}>{leadName}</a></p>
	{#if unlinking}
		<div class="confirm" role="group" aria-label="Stop following">
			<p>Stop following {leadName}? This diagram keeps what it has; new snapshots there won't show up here.</p>
			<div class="row">
				<button type="button" class="btn btn-secondary small" onclick={() => onunlink?.()}>Unlink</button>
				<button type="button" class="btn btn-ghost small" onclick={() => (unlinking = false)}>Keep following</button>
			</div>
		</div>
	{/if}
	{#if editable}
		<label class="switch">
			<input type="checkbox" checked={!paused} onchange={() => onpause?.(!paused)} />
			Keep pulling in future updates
		</label>
	{/if}
	{#if paused}<p class="note">Paused: what {leadName} changes waits here, out of the way.</p>{/if}

	{#if !groups.length}
		<p class="note">Up to date with {leadName}.</p>
	{/if}
	{#each groups as g (g.snapshot.id)}
		{@const todo = g.changes.filter(c => !decided[c.id])}
		{@const unaccepted = g.changes.filter(c => decided[c.id] !== 'accepted')}
		<div class="group" role="group" aria-label="Snapshot {g.snapshot.label}">
			<div class="g-head">
				<span class="g-title">
					<span class="g-label">{g.snapshot.label}</span>
					<span class="g-meta">{g.snapshot.authorEmail} · {ago(g.snapshot.createdAt, now)} · {plural(g.changes.length, 'change')}</span>
				</span>
				{#if editable && todo.length}
					<button type="button" class="btn btn-ghost small" aria-label="Skip all from {g.snapshot.label}" onclick={() => onskip?.(todo.map(c => c.id))}>Skip all</button>
				{/if}
				{#if editable && unaccepted.length}
					<button type="button" class="btn btn-primary small" aria-label="Accept all from {g.snapshot.label}" onclick={() => onaccept?.(unaccepted, `Accept “${g.snapshot.label}”`)}>Accept all</button>
				{/if}
			</div>
			<ul>
				{#each g.changes as c (c.id)}
					{@const verdict = decided[c.id]}
					<li class:done={!!verdict}>
						<span class="c-text">
							<span class="c-label">{c.label}</span>
							{#if c.detail}<span class="c-detail">{c.detail}</span>{/if}
						</span>
						{#if verdict}<span class="state" class:accepted={verdict === 'accepted'}>{verdict === 'accepted' ? 'Accepted' : 'Skipped'}</span>{/if}
						{#if editable}
							{#if verdict === 'accepted'}
								<button type="button" class="btn btn-ghost small" aria-label="Take back accepting {c.label}" onclick={() => onundecide?.(c.id)}>Undo</button>
							{:else}
								{#if !verdict}<button type="button" class="btn btn-ghost small" aria-label="Skip {c.label}" onclick={() => onskip?.([c.id])}>Skip</button>{/if}
								<button type="button" class="btn btn-secondary small" aria-label="Accept {c.label}" onclick={() => onaccept?.([c], `Accept “${c.label}”`)}>Accept</button>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/each}

	{#if editable && groups.length}
		<button type="button" class="btn btn-ghost reviewed" onclick={() => onreviewed?.()}>Mark everything reviewed</button>
		<p class="note">Syncs to {leadName}'s latest snapshot. What you didn't accept stays as it is here.</p>
	{/if}
</section>

<style>
	.follow {
		padding: 14px 12px;
		border-bottom: 1px solid var(--color-divider);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: 0 4px;
	}
	h2 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 0;
	}
	.lead {
		margin: 6px 4px 0;
		font-size: 12.5px;
		color: var(--color-neutral-400);
	}
	.lead a {
		color: var(--color-accent-300);
	}
	.small {
		font-size: 11px;
		padding: 2px 8px;
		flex: none;
	}
	.confirm {
		margin: 10px 4px 0;
		padding: 9px 10px;
		border-radius: 8px;
		border: 1px solid var(--color-divider);
	}
	.confirm p {
		margin: 0 0 8px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--color-neutral-300);
	}
	.row {
		display: flex;
		gap: 6px;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 10px 4px 0;
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
	.note {
		margin: 10px 4px 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
	}
	.group {
		margin-top: 12px;
		border: 1px solid var(--color-divider);
		border-radius: 9px;
		overflow: hidden;
	}
	.g-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		padding: 8px 9px;
		background: color-mix(in srgb, var(--color-text) 4%, transparent);
	}
	.g-title {
		flex: 1 0 100%;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.g-label {
		font-size: 12.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.g-meta {
		font-size: 10.5px;
		color: var(--color-neutral-500);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 9px;
		border-top: 1px solid var(--color-divider);
	}
	li.done .c-label {
		color: var(--color-neutral-500);
	}
	.c-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.c-label {
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.c-detail {
		font-size: 10.5px;
		color: var(--color-neutral-500);
		overflow-wrap: anywhere;
	}
	.state {
		font-size: 10.5px;
		color: var(--color-neutral-600);
		flex: none;
	}
	.state.accepted {
		color: var(--color-accent-300);
	}
	.reviewed {
		width: 100%;
		margin-top: 12px;
		font-size: 12px;
	}
	/* A finger needs bigger buttons. */
	@media (pointer: coarse) {
		.small {
			min-height: 34px;
			padding: 4px 10px;
			font-size: 12px;
		}
	}
</style>
