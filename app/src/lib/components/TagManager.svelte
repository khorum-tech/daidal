<script lang="ts">
	import type { SceneTag } from '../diagram/model';
	import { distinguishable, type Condition } from '../diagram/colour';
	import { NEW_TAG_GROUP, PALETTES, paletteById, type PaletteId } from '../diagram/edit';

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
		condition = 'none',
		palette = 'nocturne',
		onpalette
	}: {
		tags: SceneTag[];
		counts: Record<string, number>;
		onchange: (key: string, change: { label?: string; color?: string; group?: string }, label: string, group?: string) => void;
		onfieldend: () => void;
		ondelete: (key: string) => void;
		onadd: (label: string, group: string) => void;
		/** A colour-vision condition (an appearance setting): colours that collide under it are left out. */
		condition?: Condition;
		/** The palette the tags are drawn from; switching recolours them all (one undo step). */
		palette?: PaletteId;
		onpalette?: (id: PaletteId) => void;
	} = $props();
	// The palette's colours first; the other palettes' under More colours. A condition leaves out what collides.
	const colours = $derived(distinguishable([...paletteById(palette).colors], condition));
	const others = $derived(
		distinguishable(
			[...new Set(PALETTES.filter(p => p.id !== palette).flatMap(p => p.colors))].filter(c => !colours.includes(c)),
			condition
		)
	);
	let more = $state(false);
	/** What a tag's picker offers: its own colour always, even when it isn't one offered. */
	function offered(own: string): string[] {
		const list = more ? [...colours, ...others] : colours;
		return list.includes(own) ? list : [own, ...list];
	}

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
	{#if onpalette}
		<section class="palettes" aria-label="Palette">
			<h3>Palette</h3>
			<div class="palette-choices" role="radiogroup" aria-label="Palette">
				{#each PALETTES as p (p.id)}
					<button type="button" role="radio" aria-checked={palette === p.id} title={p.note} onclick={() => palette !== p.id && onpalette(p.id)}>
						<span class="p-name">{p.label}</span>
						<span class="p-swatches" aria-hidden="true">{#each p.colors as c (c)}<span style:background={c}></span>{/each}</span>
					</button>
				{/each}
			</div>
			<p class="note">Switching recolours every tag, each keeping its place in the palette. It's one undo step.</p>
		</section>
	{/if}
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
							{#each offered(t.color) as c (c)}
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
							<button type="button" class="more" aria-expanded={more} onclick={() => (more = !more)}>{more ? 'Fewer colours' : 'More colours'}</button>
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
	.palettes {
		margin-bottom: 14px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.palettes h3 {
		margin: 0;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
	}
	.palette-choices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 6px;
	}
	.palette-choices button {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 7px 9px;
		border-radius: 8px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}
	.palette-choices button[aria-checked='true'] {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}
	.p-swatches {
		display: flex;
		gap: 2px;
	}
	.p-swatches span {
		flex: 1;
		height: 8px;
		border-radius: 2px;
	}
	.more {
		flex-basis: 100%;
		margin-top: 2px;
		padding: 2px 0;
		border: none;
		background: transparent;
		color: var(--color-accent-300);
		font: inherit;
		font-size: 11.5px;
		text-align: left;
		cursor: pointer;
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
