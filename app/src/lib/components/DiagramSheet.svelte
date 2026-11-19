<script lang="ts" module>
	/** A diagram linked to this one by zooming, and the address that opens it (selecting the node that links them). */
	export interface LinkedDiagram {
		id: string;
		name: string;
		href: string;
		/** The nodes that zoom into it, by name. */
		via?: string[];
	}
</script>

<script lang="ts">
	import type { Workspace } from '../types';
	import { KINDS, type KindId } from '../diagram/kinds';
	import Icon from './Icon.svelte';

	/**
	 * What can be done with a diagram as a whole: the owner renames or deletes it; anyone who can see it copies it into
	 * a workspace of theirs, as a duplicate (on its own from now on) or a follower (which tracks this diagram's
	 * snapshots). Copying and deleting report back by promise, so a failure shows here. Anyone can copy a link to it
	 * (to the view on now, if one is) and present it; its owner can lock editing on this device.
	 */
	let {
		name,
		mine,
		workspaces,
		here,
		onrename,
		kind = 'freeform',
		onkind,
		oncopy,
		ondelete,
		link = '',
		viewName = null,
		onpresent,
		locked = false,
		onlock,
		onexport,
		onconfig,
		onmove,
		linked = { above: [], below: [] }
	}: {
		name: string;
		mine: boolean;
		/** Where a copy can go: the workspaces the person belongs to. */
		workspaces: Workspace[];
		/** The workspace the diagram is in, chosen for a copy at first. */
		here: string;
		onrename: (name: string) => void;
		/** The diagram's kind, which its owner can change: it decides which types the Add menu offers first. */
		kind?: KindId;
		onkind?: (kind: KindId) => void;
		oncopy: (copy: { workspace: string; name: string; follow: boolean }) => Promise<void>;
		ondelete: () => Promise<void>;
		/** The diagram's address, and with [viewName] the view on now, which a link can open on. */
		link?: string;
		viewName?: string | null;
		onpresent?: () => void;
		/** Editing switched off on this device, so nothing changes by mistake. */
		locked?: boolean;
		onlock?: (locked: boolean) => void;
		/** Downloads the diagram as it shows now, as a PNG or SVG, keeping what the view ghosts or not. */
		onexport?: (format: 'png' | 'svg', ghosted: boolean) => Promise<void>;
		/** Opens the diagram as YAML or JSON. */
		onconfig?: () => void;
		/** The owner moves it, with its history, into another of their workspaces. */
		onmove?: (workspace: string) => Promise<void>;
		/**
		 * The diagrams this one is linked to by zooming: above, those with a node that zooms into this one; below, those
		 * this one's nodes zoom into, with the nodes that do. Each with the address that opens it.
		 */
		linked?: { above: LinkedDiagram[]; below: LinkedDiagram[] };
	} = $props();
	const elsewhere = $derived(workspaces.filter(w => w.id !== here));
	let moveTo = $state('');

	let ghosted = $state(true);

	let withView = $state(true);
	let copied = $state(false);
	const shared = $derived(viewName && withView ? `${link}?view=${encodeURIComponent(viewName)}` : link);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shared);
		} catch {
			// No clipboard (an insecure page, or refused): the field below holds the link to copy by hand.
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

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
		moveTo = '';
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
		<label class="field">
			<span>Kind</span>
			<select class="input" aria-label="Kind" aria-describedby="kind-hint" value={kind} onchange={e => onkind?.(e.currentTarget.value as KindId)}>
				{#each KINDS as k (k.id)}<option value={k.id}>{k.label}</option>{/each}
			</select>
			<small class="hint" id="kind-hint">{KINDS.find(k => k.id === kind)?.hint} It decides which types <strong>+ Add</strong> offers first.</small>
		</label>
	{:else}
		<p class="owned">You can look at this diagram, and copy it into a workspace of yours.</p>
	{/if}

	{#if linked.above.length || linked.below.length}
		<section class="share" aria-label="Linked diagrams">
			<h3>Linked diagrams</h3>
			{#each [{ label: 'Above', icon: 'treeStructure', list: linked.above }, { label: 'Below', icon: 'magnifyingGlassPlus', list: linked.below }] as group (group.label)}
				{#if group.list.length}
					<div class="linked">
						<span class="linked-label">{group.label}</span>
						<ul>
							{#each group.list as d (d.id)}
								<li>
									<a class="btn btn-secondary" href={d.href}>
										<Icon name={group.icon} size={14} /><span class="linked-name">{d.name}</span>
										{#if d.via?.length}<span class="via">from {d.via.join(', ')}</span>{/if}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		</section>
	{/if}

	<section class="share" aria-label="Share and present">
		<h3>Share and present</h3>
		<div class="link-row">
			<input class="input" readonly aria-label="Link to this diagram" value={shared} onfocus={e => e.currentTarget.select()} />
			<button type="button" class="btn btn-secondary" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
		</div>
		{#if viewName}
			<label class="switch">
				<input type="checkbox" bind:checked={withView} />
				Open on the view “{viewName}”
			</label>
		{/if}
		<p class="note">Anyone in its workspace can open the link.</p>
		{#if onpresent}<button type="button" class="btn btn-secondary present" onclick={onpresent}>Present</button>{/if}
		{#if mine && onlock}
			<label class="switch">
				<input type="checkbox" checked={locked} onchange={() => onlock(!locked)} />
				Lock editing on this device
			</label>
			<p class="note">Picking, views and tags still work; nothing in the diagram changes until you unlock.</p>
		{/if}
	</section>

	{#if onexport}
		<section class="export" aria-label="Export an image">
			<h3>Export an image</h3>
			<div class="row">
				<button type="button" class="btn btn-secondary" disabled={busy} onclick={() => run(() => onexport('png', ghosted))}>Download PNG</button>
				<button type="button" class="btn btn-secondary" disabled={busy} onclick={() => run(() => onexport('svg', ghosted))}>Download SVG</button>
			</div>
			<label class="switch">
				<input type="checkbox" bind:checked={ghosted} />
				Keep what the view switches off, faintly
			</label>
			<p class="note">The diagram as it shows now: the view and tags on, and the history replayed, if one is.</p>
		</section>
	{/if}
	{#if onconfig}
		<section class="export" aria-label="Config">
			<h3>Config</h3>
			<button type="button" class="btn btn-secondary present" onclick={onconfig}>{mine ? 'Edit as YAML or JSON' : 'View as YAML or JSON'}</button>
			<p class="note">The diagram as a .daidal.yaml or .daidal.json file{mine ? ', to edit, download, or replace from a file' : ', to copy or download'}.</p>
		</section>
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

	{#if mine && onmove && elsewhere.length}
		<form
			class="copy"
			onsubmit={e => {
				e.preventDefault();
				if (moveTo) void run(() => onmove(moveTo));
			}}
		>
			<h3>Move</h3>
			<label class="field">
				<span>To</span>
				<select class="input" aria-label="Move to" bind:value={moveTo}>
					<option value="" disabled>Pick a workspace…</option>
					{#each elsewhere as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
				</select>
			</label>
			<button type="submit" class="btn btn-secondary" disabled={busy || !moveTo}>Move the diagram</button>
			<p class="note">It goes with its history; whatever follows it keeps following. Only that workspace's members will see it.</p>
		</form>
	{/if}

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
	.hint {
		font-size: 12px;
		color: var(--color-neutral-500);
	}
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
	.share {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	.export {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	.export .btn {
		font-size: 12.5px;
	}
	.linked {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.linked-label {
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.linked ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.linked .btn {
		width: 100%;
		justify-content: flex-start;
		gap: 6px;
		font-size: 12.5px;
	}
	.linked-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.via {
		margin-left: auto;
		flex: none;
		max-width: 45%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-body, inherit);
		font-weight: 400;
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.link-row {
		display: flex;
		gap: 6px;
	}
	.link-row .input {
		flex: 1;
		min-width: 0;
		color: var(--color-neutral-400);
	}
	.link-row .btn,
	.present {
		flex: none;
		font-size: 12.5px;
	}
	.present {
		align-self: flex-start;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
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
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
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
