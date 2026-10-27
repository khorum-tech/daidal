<script lang="ts">
	import type { SceneTag } from '../diagram/model';
	import { distinguishable, type Condition } from '../diagram/colour';
	import { MORE_TAG_COLORS, NEW_TAG_GROUP, TAG_COLORS } from '../diagram/edit';

	/**
	 * The prototype's "Manage tags": every tag on a row (colour, name, group, how many nodes carry it, delete), and a
	 * form to add one. A name edits in place, as one undo step per visit; a group can be one in use or a new one.
	 */
	let {
		tags,
		counts,
		onchange,
		onfieldend,
		ondelete,
		onadd,
		condition = 'none'
	}: {
		tags: SceneTag[];
		counts: Record<string, number>;
		onchange: (key: string, change: { label?: string; color?: string; group?: string }, label: string, group?: string) => void;
		onfieldend: () => void;
		ondelete: (key: string) => void;
		onadd: (label: string, group: string) => void;
		/** A colour-vision condition (an appearance setting): colours that collide under it are left out. */
		condition?: Condition;
	} = $props();
	const colours = $derived([...distinguishable(TAG_COLORS, condition), ...distinguishable(MORE_TAG_COLORS, condition)]);

	const groups = $derived([...new Set(tags.map(t => t.group))]);
	let picking = $state<string | null>(null);
	let newName = $state('');
	let newGroup = $state('');

	function add(e: SubmitEvent) {
		e.preventDefault();
		if (!newName.trim()) return;
		onadd(newName.trim(), newGroup.trim() || groups[0] || NEW_TAG_GROUP);
		newName = '';
	}
</script>

<div class="manager">
	<datalist id="tag-groups">
		{#each groups as g (g)}<option value={g}></option>{/each}
	</datalist>
	{#if tags.length}
		<ul>
			{#each tags as t (t.key)}
				<li>
					<div class="row">
						<button type="button" class="swatch" style:background={t.color} aria-label="Colour of {t.label}" aria-expanded={picking === t.key} onclick={() => (picking = picking === t.key ? null : t.key)}></button>
						<input
							class="input name"
							value={t.label}
							aria-label="Name of {t.label}"
							oninput={e => onchange(t.key, { label: e.currentTarget.value }, 'Rename tag', `tag${t.key}:label`)}
							onblur={() => onfieldend()}
						/>
						<input
							class="input group"
							list="tag-groups"
							value={t.group}
							aria-label="Group of {t.label}"
							onchange={e => {
								if (e.currentTarget.value.trim() !== t.group) onchange(t.key, { group: e.currentTarget.value }, 'Move tag to a group');
							}}
						/>
						<span class="count" title="Nodes with this tag">{counts[t.key] ?? 0}</span>
						<button type="button" class="x" aria-label="Delete tag {t.label}" onclick={() => ondelete(t.key)}>×</button>
					</div>
					{#if picking === t.key}
						<div class="swatches" role="group" aria-label="Colours for {t.label}">
							{#each colours.includes(t.color) ? colours : [t.color, ...colours] as c (c)}
								<button
									type="button"
									class="pick"
									class:on={c === t.color}
									style:background={c}
									aria-label="Colour {c}"
									aria-pressed={c === t.color}
									onclick={() => {
										onchange(t.key, { color: c }, 'Recolour tag');
										picking = null;
									}}
								></button>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No tags yet. Add the first below.</p>
	{/if}

	<form class="add" onsubmit={add}>
		<input class="input" aria-label="New tag name" placeholder="New tag name…" bind:value={newName} />
		<input class="input group" list="tag-groups" aria-label="New tag group" placeholder={groups[0] ?? NEW_TAG_GROUP} bind:value={newGroup} />
		<button type="submit" class="btn btn-secondary" disabled={!newName.trim()}>Add tag</button>
	</form>
	{#if condition !== 'none'}
		<p class="note">Colours that are hard to tell apart under your colour-vision setting are left out of the pickers (Appearance, in your menu).</p>
	{/if}
	<p class="note">Type in a row to rename a tag. A group can be one in use or a new name. Deleting a tag takes it off its nodes and out of every view.</p>
</div>

<style>
	.manager {
		padding: 12px 16px 16px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	li {
		border: 1px solid var(--color-divider);
		border-radius: 8px;
		padding: 5px 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 22px;
		height: 22px;
		flex: none;
		border: none;
		border-radius: 6px;
		cursor: pointer;
	}
	.input {
		min-width: 0;
		min-height: 30px;
		padding: 3px 7px;
		font-size: 12.5px;
	}
	.name {
		flex: 1;
	}
	.group {
		flex: 0 1 110px;
		font-size: 11.5px;
	}
	.count {
		width: 26px;
		flex: none;
		text-align: right;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.x {
		width: 28px;
		height: 28px;
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
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 2px 4px;
	}
	.pick {
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		box-shadow: 0 0 0 2px var(--color-surface);
	}
	.pick.on {
		box-shadow:
			0 0 0 2px var(--color-surface),
			0 0 0 4px var(--color-accent);
	}
	.add {
		display: flex;
		gap: 6px;
		margin-top: 14px;
	}
	.add .input:first-child {
		flex: 1;
	}
	.add .btn {
		flex: none;
		font-size: 12.5px;
		padding: 5px 10px;
	}
	.empty,
	.note {
		margin: 10px 0 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.input {
			font-size: 16px;
		}
	}
</style>
