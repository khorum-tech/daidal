<script lang="ts">
	import type { CustomType, Workspace } from '../types';
	import Icon from './Icon.svelte';
	import TypeManager from './TypeManager.svelte';

	/**
	 * A workspace as a whole. Its owner renames it, adds and removes members (by email: someone can be added before
	 * they first sign in), and deletes it; anyone in it sees who else is and exports it as a backup. A personal
	 * workspace is only ever yours: it can't be shared or deleted. Anyone in it can add the workspace's own node
	 * types ([onsavetype]). Actions report back by promise, so a failure shows here.
	 */
	let {
		workspace,
		me,
		onrename,
		onadd,
		onremove,
		onexport,
		ondelete,
		onleave,
		onsavetype,
		onremovetype
	}: {
		workspace: Workspace;
		/** The signed-in person's email. */
		me: string;
		onrename: (name: string) => Promise<void>;
		onadd: (email: string) => Promise<void>;
		onremove: (email: string) => Promise<void>;
		onexport: () => Promise<void>;
		ondelete: () => Promise<void>;
		/** A member (not the owner) takes themselves out; what they made here stays, now the owner's. */
		onleave?: () => Promise<void>;
		/** Adds a type, or changes the one stored under [key] (null for a new one). */
		onsavetype?: (key: string | null, type: CustomType) => Promise<void>;
		onremovetype?: (key: string) => Promise<void>;
	} = $props();

	const owner = $derived(workspace.ownerEmail === me);
	let email = $state('');
	let busy = $state(false);
	let failed = $state('');
	let confirming = $state(false);
	let leaving = $state(false);
	let shownFor = '';
	$effect.pre(() => {
		if (shownFor === workspace.id) return;
		shownFor = workspace.id;
		email = '';
		failed = '';
		confirming = false;
		leaving = false;
	});

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
	function rename(e: Event & { currentTarget: HTMLInputElement }) {
		const input = e.currentTarget;
		const to = input.value.trim();
		if (!to) input.value = workspace.name;
		else if (to !== workspace.name) void run(() => onrename(to));
	}
	function add(e: SubmitEvent) {
		e.preventDefault();
		const who = email.trim().toLowerCase();
		if (!who) return;
		void run(async () => {
			await onadd(who);
			email = '';
		});
	}
</script>

<div class="ws-sheet">
	{#if owner}
		<label class="field">
			<span>Name</span>
			<input class="input" value={workspace.name} maxlength="100" onchange={rename} onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()} />
		</label>
	{/if}

	<section aria-label="Members">
		<h3>Members</h3>
		{#if workspace.personal}
			<p class="note">Your personal workspace is only yours. To share diagrams, make a workspace and add people to it.</p>
		{:else}
			<ul class="members">
				{#each workspace.members as m (m)}
					<li>
						<span class="avatar" aria-hidden="true">{m.slice(0, 1).toUpperCase()}</span>
						<span class="who">{m}</span>
						{#if m === workspace.ownerEmail}<span class="badge">owner</span>{:else if m === me}<span class="badge">you</span>{/if}
						{#if owner && m !== workspace.ownerEmail}
							<button type="button" class="x" aria-label="Remove {m}" disabled={busy} onclick={() => run(() => onremove(m))}>×</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if owner}
				<form class="add" onsubmit={add}>
					<input class="input" type="email" inputmode="email" autocomplete="off" aria-label="Email to add" placeholder="someone@company.com" bind:value={email} />
					<button type="submit" class="btn btn-secondary" disabled={busy || !email.trim()}>Add</button>
				</form>
				<p class="note">They see this workspace's diagrams the next time they open Daidal, and can copy them. Only you can change who's in it, and only you see the whole list.</p>
			{:else}
				<p class="note">Only {workspace.ownerEmail} can change who's in it, and only they see everyone in it.</p>
			{/if}
		{/if}
	</section>

	{#if onsavetype && onremovetype}
		<section aria-label="Types">
			<h3>Types</h3>
			<TypeManager types={workspace.types} onsave={onsavetype} onremove={onremovetype} />
		</section>
	{/if}

	<section aria-label="Backup">
		<h3>Backup</h3>
		<button type="button" class="btn btn-secondary" disabled={busy} onclick={() => run(onexport)}>Export a backup</button>
		<p class="note">A file with this workspace's diagrams, their history and which follows which (not its members). Import it from the home screen to make a copy of the whole workspace.</p>
	</section>

	{#if owner && !workspace.personal}
		<div class="danger-zone">
			{#if confirming}
				<p>Delete “{workspace.name}” with all its diagrams and their history, for everyone in it? Copies that follow them elsewhere keep what they have.</p>
				<div class="row">
					<button type="button" class="btn btn-secondary danger" disabled={busy} onclick={() => run(ondelete)}><Icon name="trash" size={14} />Delete for good</button>
					<button type="button" class="btn btn-ghost" onclick={() => (confirming = false)}>Keep it</button>
				</div>
			{:else}
				<button type="button" class="btn btn-secondary" onclick={() => (confirming = true)}><Icon name="trash" size={14} />Delete workspace…</button>
			{/if}
		</div>
	{/if}

	{#if onleave && !owner && !workspace.personal}
		<div class="danger-zone">
			{#if leaving}
				<p>Leave “{workspace.name}”? You won't see its diagrams any more, and the ones you made here stay, now {workspace.ownerEmail}'s. Its owner can add you back.</p>
				<div class="row">
					<button type="button" class="btn btn-secondary danger" disabled={busy} onclick={() => run(onleave)}>Leave the workspace</button>
					<button type="button" class="btn btn-ghost" onclick={() => (leaving = false)}>Stay</button>
				</div>
			{:else}
				<button type="button" class="btn btn-secondary" onclick={() => (leaving = true)}>Leave this workspace…</button>
			{/if}
		</div>
	{/if}

	{#if failed}<p class="error" role="alert">{failed}</p>{/if}
</div>

<style>
	.ws-sheet {
		display: flex;
		flex-direction: column;
		gap: 16px;
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
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	h3 {
		margin: 0;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
	}
	.members {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.members li {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 34px;
		font-size: 13px;
	}
	.avatar {
		width: 26px;
		height: 26px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--color-accent-700);
		color: var(--color-accent-100);
		font-size: 12px;
	}
	.who {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badge {
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
	}
	.x {
		width: 30px;
		height: 30px;
		flex: none;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--color-neutral-500);
		font-size: 16px;
		cursor: pointer;
	}
	.x:hover {
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.add {
		display: flex;
		gap: 6px;
	}
	.add .input {
		flex: 1;
	}
	.btn {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
	}
	.note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
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
