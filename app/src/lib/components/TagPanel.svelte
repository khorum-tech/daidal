<script lang="ts">
	import { tagGroups, type Scene } from '@khorum-oss/daidal-core/model';
	import Icon from './Icon.svelte';

	/**
	 * Views and tags, as the prototype's left panel lists them. Switching a tag off, or soloing one, only changes what
	 * this browser shows; nothing is saved. With [editable] on, the tags on now can be saved as a view, the chosen
	 * view renamed, re-saved, made the one the diagram opens on, or deleted, and the tags managed ([onmanage]).
	 */
	let {
		scene,
		on,
		view,
		onview,
		ontoggle,
		solo = null,
		onsolo,
		editable = false,
		onsaveview,
		onrenameview,
		onresaveview,
		ondeleteview,
		ondefaultview,
		onlockview,
		onmanage
	}: {
		scene: Scene;
		on: Record<string, boolean>;
		view: string | null;
		onview: (view: string | null) => void;
		ontoggle: (tag: string) => void;
		/** The tag shown alone, if any. */
		solo?: string | null;
		onsolo?: (tag: string) => void;
		editable?: boolean;
		onsaveview?: () => void;
		/** Asks to rename a view; false means the name can't be used. */
		onrenameview?: (name: string, to: string) => boolean;
		onresaveview?: (name: string) => void;
		ondeleteview?: (name: string) => void;
		ondefaultview?: (name: string | null) => void;
		/** Locks a view (it can still be shown, not changed) or unlocks it. */
		onlockview?: (name: string, locked: boolean) => void;
		onmanage?: () => void;
	} = $props();

	const groups = $derived(tagGroups(scene));
	const count = (key: string) => scene.nodes.filter(n => n.tags.includes(key)).length;
	const current = $derived(scene.views.find(v => v.label === view));
	const onNow = $derived(scene.tags.filter(t => on[t.key]).map(t => t.key));
	const changed = $derived(!!current && (current.tags.length !== onNow.length || current.tags.some(t => !on[t])));
	let nameError = $state(false);
	// The view editor opens on request (the prototype's caret), and closes whenever another view is chosen.
	let editing = $state(false);
	let editingFor: string | null = null;
	$effect.pre(() => {
		if (view === editingFor) return;
		editingFor = view;
		editing = false;
		nameError = false;
	});
	function rename(e: Event & { currentTarget: HTMLInputElement }) {
		if (!current) return;
		const to = e.currentTarget.value.trim();
		if (to === current.label) return;
		// The view about to be chosen is this one under its new name, so the editor stays open across the rename.
		const before = editingFor;
		editingFor = to;
		nameError = !onrenameview?.(current.label, to);
		if (nameError) {
			editingFor = before;
			e.currentTarget.value = current.label;
		}
	}
</script>

<aside class="panel" aria-label="Views and tags">
	{#if scene.views.length || editable}
		<section>
			<h2>Views</h2>
			<ul class="views">
				<li>
					<button type="button" class:active={view === null} aria-pressed={view === null} onclick={() => onview(null)}>Everything</button>
				</li>
				{#each scene.views as v (v.label)}
					<li class="view-row">
						<button type="button" class:active={view === v.label} aria-pressed={view === v.label} onclick={() => onview(v.label)}>
							{v.label}{#if view === v.label && changed}<span class="changed" title="The tags on now differ from this view">changed</span>{/if}{#if scene.initialView === v.label}<span class="default" title="The diagram opens on this view">default</span>{/if}{#if v.locked}<span class="lock" title="Locked: it can be shown, not changed"><Icon name="lock" size={11} label="locked" /></span>{/if}
						</button>
						{#if editable && view === v.label}
							<button type="button" class="edit-view" aria-expanded={editing} aria-label="Edit view {v.label}" title="Rename, re-save or delete this view" onclick={() => (editing = !editing)}>
								{editing ? 'Done' : 'Edit'}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if editable && current && editing}
				<div class="view-edit" role="group" aria-label="Edit view {current.label}">
					{#key current.label}
						<input class="input" aria-label="View name" value={current.label} disabled={current.locked} onchange={rename} onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()} />
					{/key}
					{#if nameError}<p class="error" role="alert">Another view has that name, or it is empty.</p>{/if}
					<button type="button" class="act" disabled={!changed || current.locked} onclick={() => onresaveview?.(current.label)}>
						{changed ? 'Save the tags on now' : 'Matches the tags on now'}
					</button>
					<label class="switch">
						<input type="checkbox" checked={scene.initialView === current.label} onchange={() => ondefaultview?.(scene.initialView === current.label ? null : current.label)} />
						The diagram opens on this view
					</label>
					<label class="switch">
						<input type="checkbox" checked={current.locked} onchange={() => onlockview?.(current.label, !current.locked)} />
						Lock this view
					</label>
					{#if current.locked}
						<p class="locked-note">Locked: it can still be shown, but not renamed, re-saved or deleted.</p>
					{:else}
						<button type="button" class="act danger" onclick={() => ondeleteview?.(current.label)}>Delete view</button>
					{/if}
				</div>
			{/if}
			{#if editable}
				<button type="button" class="add-view" data-tour="save-view" onclick={() => onsaveview?.()}>+ Save the tags on now as a view</button>
			{/if}
		</section>
	{/if}
	{#each groups as g (g.name)}
		<section>
			<h2>{g.name}</h2>
			<ul class="tags">
				{#each g.tags as t (t.key)}
					<li class="tag-row">
						<label class:off={!on[t.key]}>
							<input type="checkbox" checked={on[t.key]} onchange={() => ontoggle(t.key)} />
							<span class="swatch" style:background={t.color}></span>
							<span class="label">{t.label}</span>
							<span class="count">{count(t.key)}</span>
						</label>
						{#if onsolo}
							<button
								type="button"
								class="solo"
								class:on={solo === t.key}
								aria-pressed={solo === t.key}
								aria-label={solo === t.key ? `Stop soloing ${t.label}` : `Solo ${t.label}`}
								title={solo === t.key ? 'Stop soloing: bring the other tags back' : 'Show only this tag'}
								onclick={() => onsolo(t.key)}
							>
								<Icon name="crosshair" size={13} />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="empty">This diagram has no tags.</p>
	{/each}
	{#if editable}
		<button type="button" class="manage" onclick={() => onmanage?.()}>Manage tags</button>
	{/if}
</aside>

<style>
	.lock {
		display: inline-flex;
		margin-left: 6px;
		vertical-align: -1px;
		color: var(--color-neutral-500);
	}
	.locked-note {
		margin: 2px 0 0;
		font-size: 11px;
		line-height: 1.45;
		color: var(--color-neutral-500);
	}
	.panel {
		width: 248px;
		flex: none;
		overflow-y: auto;
		border-right: 1px solid var(--color-divider);
		padding: 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 0 4px 6px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.views button {
		width: 100%;
		text-align: left;
		font: inherit;
		font-size: 12.5px;
		padding: 6px 8px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.views button:hover {
		background: color-mix(in srgb, var(--color-text) 6%, transparent);
	}
	.views button.active {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 7px;
		font-size: 12.5px;
		cursor: pointer;
	}
	label:hover {
		background: color-mix(in srgb, var(--color-text) 6%, transparent);
	}
	label.off .label,
	label.off .swatch {
		opacity: 0.45;
	}
	input {
		accent-color: var(--color-accent);
		margin: 0;
	}
	.swatch {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex: none;
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		font-size: 11px;
		color: var(--color-neutral-600);
	}
	.empty {
		font-size: 12px;
		color: var(--color-neutral-600);
		margin: 0 4px;
	}
	.changed,
	.default {
		margin-left: 6px;
		font-size: 9.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
	}
	.changed {
		color: var(--color-accent-300);
	}
	.view-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.view-row > button:first-child {
		flex: 1;
		min-width: 0;
	}
	.views .edit-view {
		width: auto;
		flex: none;
		min-height: 28px;
		padding: 3px 9px;
		border: 1px solid var(--color-divider);
		border-radius: 7px;
		font-size: 11.5px;
		color: var(--color-neutral-300);
	}
	.view-edit {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 8px 4px 0;
		padding: 8px;
		border: 1px solid var(--color-divider);
		border-radius: 8px;
	}
	.view-edit .input {
		width: 100%;
		box-sizing: border-box;
		min-height: 30px;
		padding: 3px 7px;
		font-size: 12.5px;
	}
	.error {
		margin: 0;
		font-size: 11px;
		color: var(--color-danger, #e5767b);
	}
	.act,
	.add-view,
	.manage {
		font: inherit;
		font-size: 12px;
		min-height: 30px;
		padding: 4px 8px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-300);
		cursor: pointer;
		text-align: left;
	}
	.act:disabled {
		color: var(--color-neutral-600);
		cursor: default;
	}
	.act.danger:hover {
		color: var(--color-danger, #e5767b);
		border-color: currentColor;
	}
	.add-view {
		width: calc(100% - 8px);
		margin: 8px 4px 0;
		border-style: dashed;
		color: var(--color-accent);
	}
	.manage {
		margin: 0 4px;
	}
	.switch {
		padding: 2px 0;
		font-size: 11.5px;
		color: var(--color-neutral-400);
	}
	.switch:hover {
		background: none;
	}
	.tag-row {
		display: flex;
		align-items: center;
	}
	.tag-row label {
		flex: 1;
		min-width: 0;
	}
	.solo {
		width: 28px;
		height: 28px;
		flex: none;
		display: grid;
		place-items: center;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-neutral-700);
		cursor: pointer;
	}
	.solo:hover {
		color: var(--color-neutral-300);
	}
	.solo.on {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.view-edit .input {
			font-size: 16px;
		}
	}
</style>
