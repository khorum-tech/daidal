<script lang="ts">
	import type { CustomType } from '../types';
	import { ICON_LIBRARY, TYPE_CATS, typeKey } from '../diagram/icons';
	import { slug } from '../diagram/model';
	import Icon from './Icon.svelte';
	import IconPicker from './IconPicker.svelte';

	/**
	 * A workspace's own node types: each a name, a category for the type picker and an icon from the library. Any
	 * member adds, changes or removes one. One named like a built-in type (say "Database") redraws that type in this
	 * workspace. Saving reports back by promise, so a failure shows here; [onsave] gets the slug the type was stored
	 * under, or null for a new one.
	 */
	let {
		types,
		onsave,
		onremove
	}: {
		types: CustomType[];
		onsave: (key: string | null, type: CustomType) => Promise<void>;
		onremove: (key: string) => Promise<void>;
	} = $props();

	const BUILT_IN = TYPE_CATS.flatMap(c => c.items.map(([label]) => label));
	const categories = $derived([...new Set([...TYPE_CATS.map(c => c.cat), ...types.map(t => t.category)])]);

	/** The type being edited: null for none, '' for a new one, else the slug it's stored under. */
	let editing = $state<string | null>(null);
	let name = $state('');
	let category = $state('');
	let icon = $state('cube');
	let busy = $state(false);
	let failed = $state('');

	const builtIn = $derived(BUILT_IN.find(b => typeKey(b) === typeKey(name)));
	const valid = $derived(name.trim() !== '' && slug(name) !== 'unspecified' && category.trim() !== '');

	function open(type: CustomType | null) {
		editing = type ? slug(type.name) : '';
		name = type?.name ?? '';
		category = type?.category ?? '';
		icon = type?.icon ?? 'cube';
		failed = '';
	}

	async function run(action: () => Promise<void>) {
		busy = true;
		failed = '';
		try {
			await action();
			editing = null;
		} catch (e) {
			failed = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}

	function save(e: SubmitEvent) {
		e.preventDefault();
		if (!valid || editing === null) return;
		const key = editing || null;
		void run(() => onsave(key, { name: name.trim(), category: category.trim(), icon }));
	}
</script>

<div class="types">
	{#if types.length}
		<ul class="list">
			{#each types as t (t.name)}
				<li>
					<Icon name={t.icon} size={16} />
					<span class="name">{t.name}</span>
					<span class="cat">{t.category}</span>
					<button type="button" class="btn btn-ghost" aria-label="Edit {t.name}" disabled={busy} onclick={() => open(t)}>Edit</button>
					<button type="button" class="x" aria-label="Remove {t.name}" disabled={busy} onclick={() => run(() => onremove(slug(t.name)))}>×</button>
				</li>
			{/each}
		</ul>
	{:else if editing === null}
		<p class="note">None yet. Add one for something the built-in types don't cover, like a “Billing Agent”, with any icon from the library.</p>
	{/if}

	{#if editing !== null}
		<form class="form" onsubmit={save} aria-label={editing ? 'Edit type' : 'New type'}>
			<label class="field">
				<span>Name</span>
				<input class="input" maxlength="60" placeholder="e.g. Billing Agent" bind:value={name} />
			</label>
			{#if builtIn}<p class="note">Changes how the built-in {builtIn} type looks in this workspace.</p>{/if}
			<label class="field">
				<span>Category</span>
				<input class="input" maxlength="40" list="type-categories" placeholder="e.g. AI" bind:value={category} />
				<datalist id="type-categories">
					{#each categories as c (c)}<option value={c}></option>{/each}
				</datalist>
			</label>
			<div class="field">
				<span>Icon: {ICON_LIBRARY[icon]?.label ?? icon}</span>
				<IconPicker current={icon} onpick={i => (icon = i)} />
			</div>
			<div class="row">
				<button type="submit" class="btn btn-primary" disabled={busy || !valid}>{editing ? 'Save type' : 'Add type'}</button>
				<button type="button" class="btn btn-ghost" onclick={() => (editing = null)}>Cancel</button>
			</div>
		</form>
	{:else}
		<button type="button" class="btn btn-secondary" disabled={busy} onclick={() => open(null)}>+ Add a type</button>
	{/if}
	<p class="note">They show in the type picker for every diagram in this workspace, for everyone in it.</p>
	{#if failed}<p class="error" role="alert">{failed}</p>{/if}
</div>

<style>
	.types {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 34px;
		font-size: 13px;
	}
	.list li :global(svg) {
		color: var(--color-accent);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cat {
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px;
		border: 1px solid var(--color-divider);
		border-radius: 9px;
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
	.row {
		display: flex;
		gap: 8px;
	}
	.btn {
		align-self: flex-start;
		font-size: 12.5px;
	}
	.list .btn {
		align-self: center;
		padding: 4px 8px;
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
	.note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
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
