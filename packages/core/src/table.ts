import type { DocColumn, ColumnKey } from './types';

/**
 * A table block: a database table drawn as a card of its columns, each with its key, its name and its data type, so
 * every table in a workspace reads the same way. Documents keep the columns as structured entries; people and configs
 * may also write one as a line ("id: uuid", "PK id: uuid", "customer_id: uuid FK"), which reads into the same entry.
 *
 * Each column may carry an id that stays put when it is renamed. Nothing points at a column yet; the id is there so a
 * later relationship (an ERD's foreign key to another table's column) has something steady to point at.
 */

/** The keys a column can have, as a card badges them. */
export const COLUMN_KEYS = [
	{ id: 'pk', label: 'PK', title: 'Primary key' },
	{ id: 'fk', label: 'FK', title: 'Foreign key' },
	{ id: 'unique', label: 'UQ', title: 'Unique' }
] as const satisfies readonly { id: ColumnKey; label: string; title: string }[];

/** Other names people write for a key: "primary key", "foreign", "uk". */
const KEY_NAMES: Record<string, ColumnKey> = {
	pk: 'pk',
	primary: 'pk',
	'primary key': 'pk',
	'primary-key': 'pk',
	fk: 'fk',
	foreign: 'fk',
	'foreign key': 'fk',
	'foreign-key': 'fk',
	references: 'fk',
	unique: 'unique',
	uq: 'unique',
	uk: 'unique',
	'unique key': 'unique'
};

/** A key as a document or config names it; '' for none (or a word that isn't one). */
export function toKey(raw: unknown): ColumnKey | '' {
	if (typeof raw !== 'string') return '';
	return KEY_NAMES[raw.trim().toLowerCase().replaceAll(/\s+/g, ' ')] ?? '';
}

/** A key's badge: "PK", "FK", "UQ"; '' for none. */
export const keyLabel = (key: unknown): string => COLUMN_KEYS.find(k => k.id === toKey(key))?.label ?? '';

/** Data types offered while typing one. Any other type is fine: a column's type is the database's own word for it. */
export const DATA_TYPES = [
	'uuid',
	'int',
	'bigint',
	'smallint',
	'serial',
	'bigserial',
	'decimal',
	'numeric',
	'float',
	'double',
	'boolean',
	'varchar(255)',
	'char',
	'text',
	'date',
	'time',
	'timestamp',
	'timestamptz',
	'interval',
	'json',
	'jsonb',
	'bytea',
	'blob',
	'enum'
] as const;

const text = (v: unknown): string => {
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	return '';
};

/** [words] with a key word taken off its start or end ("PK id", "id uuid pk"), and the key it was. */
function takeKey(words: string): { rest: string; key: ColumnKey | '' } {
	const s = words.trim();
	const parts = s.split(/\s+/);
	if (parts.length > 1) {
		const first = toKey(parts[0]);
		if (first) return { rest: parts.slice(1).join(' '), key: first };
		const last = toKey(parts.at(-1)!.replaceAll(/[()[\]]/g, ''));
		if (last) return { rest: parts.slice(0, -1).join(' '), key: last };
	}
	return { rest: s, key: '' };
}

/**
 * A column written as a line, or null when there's no name: "id: uuid", "PK id: uuid", "customer_id: uuid FK",
 * "status" (a name alone). A list's bullet is taken off first.
 */
export function parseColumn(line: string): DocColumn | null {
	const s = line.trim().replace(/^[-*•]\s+/, '');
	if (!s) return null;
	const colon = s.indexOf(':');
	const head = takeKey(colon < 0 ? s : s.slice(0, colon));
	const after = colon < 0 ? '' : s.slice(colon + 1);
	// After the colon, a key on its own ("id: primary key") is the key, with no type.
	const tail = toKey(after) ? { rest: '', key: toKey(after) } : takeKey(after);
	const name = head.rest.trim();
	if (!name) return null;
	const type = tail.rest.trim();
	const key = head.key || tail.key;
	return { name, ...(type ? { type } : {}), ...(key ? { key } : {}) };
}

/** A column written back as a line, the way [parseColumn] reads it: "PK id: uuid". */
export function columnText(c: DocColumn): string {
	const key = keyLabel(c.key);
	return `${key ? key + ' ' : ''}${c.name}${c.type ? ': ' + c.type : ''}`;
}

/**
 * One column as a document or config gives it, cleaned: a line, or an entry with a name and any of id, type and key.
 * Null when it has no name.
 */
export function toColumn(raw: unknown): DocColumn | null {
	if (typeof raw === 'string') return parseColumn(raw);
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	const name = text(o.name).trim();
	if (!name) return null;
	const id = text(o.id).trim();
	const type = text(o.type).trim();
	const key = toKey(o.key);
	return { ...(id ? { id } : {}), name, ...(type ? { type } : {}), ...(key ? { key } : {}) };
}

/** A table's columns as its document holds them, cleaned: a list of entries or lines; anything else is none. */
export function toColumns(raw: unknown): DocColumn[] {
	let list: unknown[] = [];
	if (Array.isArray(raw)) list = raw;
	else if (raw != null && raw !== '') list = [raw];
	return list.map(toColumn).filter((c): c is DocColumn => c !== null);
}

/** An id for a new column that none of [columns] has: c1, c2… */
export function newColumnId(columns: readonly DocColumn[]): string {
	const taken = new Set(columns.map(c => c.id));
	let i = columns.length + 1;
	while (taken.has(`c${i}`)) i++;
	return `c${i}`;
}

/** [columns] with an id on each that has none, none of them shared: what the editor and the MCP tools save. */
export function withColumnIds(columns: readonly DocColumn[]): DocColumn[] {
	const given = columns.filter(c => c.id);
	const out: DocColumn[] = [];
	for (const c of columns) {
		if (c.id && !out.some(o => o.id === c.id)) out.push(c);
		// toColumn puts the id first, as every saved column has it.
		else out.push(toColumn({ ...c, id: newColumnId([...given, ...out]) }) ?? c);
	}
	return out;
}

/**
 * How a table block is laid out, in pixels: shared by the canvas card and the SVG export so they agree. Under the type
 * row come the table's name in monospace and its subtitle; then a rule and its columns, a row each: the key's badge
 * (when any column has a key), the column's name and, at the right, its data type. Past [TABLE.max] columns the last
 * row counts what it leaves out.
 */
export const TABLE = {
	padX: 13,
	padY: 11,
	head: 14,
	nameTop: 7,
	nameSize: 13.5,
	nameLine: 18,
	subTop: 2,
	subLine: 16,
	ruleTop: 8,
	size: 11.5,
	row: 22,
	keyW: 26,
	keySize: 8.5,
	gap: 8,
	max: 10
} as const;

/** The rows a table block shows: its columns within [TABLE.max], else one fewer and a count of the rest. */
export function tableRows(columns: DocColumn[]): { shown: DocColumn[]; more: number } {
	if (columns.length <= TABLE.max) return { shown: columns, more: 0 };
	const keep = TABLE.max - 1;
	return { shown: columns.slice(0, keep), more: columns.length - keep };
}

/** The height a table block needs for its subtitle and its column rows. */
export function tableHeight(sub: string, columns: DocColumn[]): number {
	const { shown, more } = tableRows(columns);
	const rows = shown.length + (more ? 1 : 0);
	return Math.ceil(2 * TABLE.padY + 2 + TABLE.head + TABLE.nameTop + TABLE.nameLine + (sub.trim() ? TABLE.subTop + TABLE.subLine : 0) + (rows ? TABLE.ruleTop + rows * TABLE.row : 0));
}

/**
 * How a table block's [w] is shared across its rows: the key badges' room (none when no column has a key), the data
 * types' (as wide as the longest needs, up to 45% of what's left) and the names' (the rest).
 */
export function tableWidths(columns: DocColumn[], w: number): { key: number; name: number; type: number } {
	const inner = Math.max(0, w - 2 * TABLE.padX);
	const key = columns.some(c => toKey(c.key)) ? TABLE.keyW : 0;
	const longest = Math.max(0, ...columns.map(c => (c.type ?? '').length));
	const free = Math.max(0, inner - key);
	const type = longest ? Math.min(Math.ceil(longest * TABLE.size * 0.6) + 2, Math.floor(free * 0.45)) : 0;
	const name = Math.max(0, free - type - (type ? TABLE.gap : 0));
	return { key, name, type };
}
