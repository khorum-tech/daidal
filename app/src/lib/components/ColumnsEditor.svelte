<script lang="ts">
	import { COLUMN_KEYS, DATA_TYPES, newColumnId, parseColumn, toColumn, toKey, withColumnIds } from '@khorum/daidal-core/table';
	import type { ColumnKey, DocColumn } from '@khorum/daidal-core/types';
	import { tick, untrack } from 'svelte';

	/**
	 * A table's columns, a card each: its name, then its key and its data type side by side. Every field stacks in the
	 * panel's width, so a phone or a tablet in portrait never scrolls sideways. The data type is free text (the
	 * database's own word for it) with the usual ones offered as you type.
	 *
	 * The rows are this editor's own copy while one of them has focus, so a column being named stays as typed; every
	 * keystroke still saves the columns as they read so far (a row without a name isn't a column yet). When focus leaves
	 * the columns, the rows read the node again. Each column keeps its id (new ones get one), so a relationship drawn
	 * between tables later can point at a column through renames.
	 *
	 * [members] are a Table's columns as they were written before tables had their own (one "name: type" a line): the
	 * editor offers to turn them into columns.
	 */
	let {
		nodeId,
		columns,
		members = [],
		onchange,
		onfieldend
	}: {
		nodeId: string;
		columns: DocColumn[];
		members?: string[];
		onchange?: (change: { columns: DocColumn[]; members?: string[] }, label: string, group?: string) => void;
		onfieldend?: () => void;
	} = $props();

	interface Row {
		key: number;
		id: string;
		name: string;
		type: string;
		pk: ColumnKey | '';
	}
	let rows = $state<Row[]>([]);
	let editing = $state(false);
	let rowsFor = '';
	let seq = 0;
	$effect.pre(() => {
		const cols = columns;
		const id = nodeId;
		if (editing && id === rowsFor) return;
		rowsFor = id;
		const kept = untrack(() => rows);
		rows = cols.map((c, i) => ({ key: kept[i]?.key ?? ++seq, id: c.id ?? '', name: c.name, type: c.type ?? '', pk: toKey(c.key) }));
	});

	/** The rows as columns: every one named, each with an id no other has. */
	const clean = (list: Row[]): DocColumn[] => withColumnIds(list.map(r => toColumn({ id: r.id, name: r.name, type: r.type, key: r.pk })).filter((c): c is DocColumn => c !== null));
	const save = (label = 'Edit columns') => onchange?.({ columns: clean(rows) }, label, `${nodeId}:columns`);

	function typed(key: number, field: 'name' | 'type') {
		return (e: Event) => {
			const value = (e.currentTarget as HTMLInputElement).value;
			rows = rows.map(r => (r.key === key ? { ...r, [field]: value } : r));
			save();
		};
	}
	function keyPicked(key: number) {
		return (e: Event) => {
			const pk = toKey((e.currentTarget as HTMLSelectElement).value);
			const row = rows.find(r => r.key === key);
			rows = rows.map(r => (r.key === key ? { ...r, pk } : r));
			const what = COLUMN_KEYS.find(k => k.id === pk)?.title.toLowerCase();
			onchange?.({ columns: clean(rows) }, what ? `Make ${row?.name.trim() || 'column'} a ${what}` : `Take the key off ${row?.name.trim() || 'column'}`);
		};
	}
	async function add() {
		editing = true;
		const id = newColumnId(rows.map(r => ({ id: r.id, name: r.name })));
		const row: Row = { key: ++seq, id, name: '', type: '', pk: '' };
		rows = [...rows, row];
		await tick();
		document.getElementById(`col-name-${row.key}`)?.focus();
	}
	function remove(key: number) {
		const row = rows.find(r => r.key === key);
		rows = rows.filter(r => r.key !== key);
		onchange?.({ columns: clean(rows) }, `Remove ${row?.name.trim() || 'column'}`);
	}
	function move(key: number, by: -1 | 1) {
		const i = rows.findIndex(r => r.key === key);
		const j = i + by;
		if (i < 0 || j < 0 || j >= rows.length) return;
		const next = [...rows];
		[next[i], next[j]] = [next[j], next[i]];
		rows = next;
		onchange?.({ columns: clean(rows) }, `Move ${rows[j].name.trim() || 'column'} ${by < 0 ? 'up' : 'down'}`);
	}
	function left(e: FocusEvent) {
		if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) return;
		editing = false;
		onfieldend?.();
	}

	/** Members that read as columns ("id: uuid"), offered while the table has no columns of its own. */
	const fromMembers = $derived(columns.length ? [] : members.map(parseColumn).filter((c): c is DocColumn => c !== null));
	function useMembers() {
		onchange?.({ columns: withColumnIds(fromMembers), members: [] }, 'Make lines into columns');
	}

	const listId = $derived(`data-types-${nodeId}`);
</script>

<div class="columns" onfocusin={() => (editing = true)} onfocusout={left}>
	{#if fromMembers.length}
		<button type="button" class="btn btn-secondary from-members" onclick={useMembers}>
			Make {fromMembers.length === 1 ? 'the line' : `the ${fromMembers.length} lines`} written under members into columns
		</button>
	{/if}
	{#each rows as r, i (r.key)}
		<div class="col" role="group" aria-label="Column {r.name.trim() || i + 1}">
			<div class="col-row">
				<input id="col-name-{r.key}" class="input mono col-name" aria-label="Column name" placeholder="Column name" autocomplete="off" autocapitalize="off" spellcheck="false" value={r.name} oninput={typed(r.key, 'name')} />
				<button type="button" class="x" aria-label="Move {r.name.trim() || `column ${i + 1}`} up" disabled={i === 0} onclick={() => move(r.key, -1)}>↑</button>
				<button type="button" class="x" aria-label="Move {r.name.trim() || `column ${i + 1}`} down" disabled={i === rows.length - 1} onclick={() => move(r.key, 1)}>↓</button>
				<button type="button" class="x" aria-label="Remove column {r.name.trim() || i + 1}" onclick={() => remove(r.key)}>×</button>
			</div>
			<div class="col-detail">
				<select class="input col-key" aria-label="Key of {r.name.trim() || `column ${i + 1}`}" value={r.pk} onchange={keyPicked(r.key)}>
					<option value="">No key</option>
					{#each COLUMN_KEYS as k (k.id)}<option value={k.id}>{k.label} · {k.title}</option>{/each}
				</select>
				<input class="input mono" aria-label="Data type of {r.name.trim() || `column ${i + 1}`}" placeholder="Data type" list={listId} autocomplete="off" autocapitalize="off" spellcheck="false" value={r.type} oninput={typed(r.key, 'type')} />
			</div>
		</div>
	{/each}
	<datalist id={listId}>
		{#each DATA_TYPES as t (t)}<option value={t}></option>{/each}
	</datalist>
	<button type="button" class="btn btn-secondary add-col" onclick={add}>+ Add column</button>
</div>

<style>
	.columns {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 6px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 7px 8px 8px;
		border: 1px solid var(--color-divider);
		border-radius: 8px;
		background: var(--color-neutral-950, transparent);
	}
	.col-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.input {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-width: 0;
		min-height: 0;
		margin: 0;
		padding: 5px 8px;
		font-size: 12.5px;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12px;
	}
	.col-name {
		flex: 1;
		font-weight: 600;
	}
	/* The key and the data type side by side, the type taking what the key leaves, in whatever width the panel has. */
	.col-detail {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: 4px;
	}
	.x {
		width: 24px;
		height: 24px;
		flex: none;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--color-neutral-500);
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
	}
	.x:hover:not(:disabled) {
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.x:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.add-col,
	.from-members {
		align-self: flex-start;
		gap: 5px;
	}
	.from-members {
		white-space: normal;
		text-align: left;
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px; a finger needs a full tap's room. */
	@media (pointer: coarse) {
		.input,
		.mono {
			font-size: 16px;
		}
		.x {
			width: 32px;
			height: 32px;
		}
	}
</style>
