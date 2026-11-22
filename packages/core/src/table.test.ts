import { describe, expect, it } from 'vitest';
import { columnText, keyLabel, newColumnId, parseColumn, TABLE, tableHeight, tableRows, tableWidths, toColumn, toColumns, toKey, withColumnIds } from './table';
import { readConfig, configText } from './config';
import { tagsOn, toScene } from './model';
import { toSvg } from './render';
import type { DaidalDoc, DocColumn } from './types';

describe('columns', () => {
	it('reads a column written as a line, with its key before the name or after the type', () => {
		expect(parseColumn('id: uuid')).toEqual({ name: 'id', type: 'uuid' });
		expect(parseColumn('PK id: uuid')).toEqual({ name: 'id', type: 'uuid', key: 'pk' });
		expect(parseColumn('- customer_id: uuid FK')).toEqual({ name: 'customer_id', type: 'uuid', key: 'fk' });
		expect(parseColumn('email: varchar(255) (unique)')).toEqual({ name: 'email', type: 'varchar(255)', key: 'unique' });
		expect(parseColumn('id: primary key')).toEqual({ name: 'id', key: 'pk' });
		expect(parseColumn('status')).toEqual({ name: 'status' });
		expect(parseColumn('price: decimal(19, 4)')).toEqual({ name: 'price', type: 'decimal(19, 4)' });
		expect(parseColumn('  ')).toBeNull();
		expect(parseColumn(': uuid')).toBeNull();
	});

	it('writes a column back as a line that reads into the same column', () => {
		const c: DocColumn = { name: 'id', type: 'uuid', key: 'pk' };
		expect(columnText(c)).toBe('PK id: uuid');
		expect(parseColumn(columnText(c))).toEqual(c);
		expect(columnText({ name: 'note' })).toBe('note');
	});

	it('knows keys by their usual names', () => {
		expect(['PK', 'primary key', 'Primary  Key'].map(toKey)).toEqual(['pk', 'pk', 'pk']);
		expect(['fk', 'foreign', 'references'].map(toKey)).toEqual(['fk', 'fk', 'fk']);
		expect(['unique', 'UQ', 'uk'].map(toKey)).toEqual(['unique', 'unique', 'unique']);
		expect([undefined, '', 'index', 3].map(toKey)).toEqual(['', '', '', '']);
		expect(keyLabel('unique')).toBe('UQ');
		expect(keyLabel(undefined)).toBe('');
	});

	it('cleans columns given as entries or lines, dropping what has no name or no known key', () => {
		expect(toColumn({ id: ' c1 ', name: ' id ', type: ' uuid ', key: 'Primary key' })).toEqual({ id: 'c1', name: 'id', type: 'uuid', key: 'pk' });
		expect(toColumn({ name: 'x', key: 'index' })).toEqual({ name: 'x' });
		expect(toColumn({ type: 'uuid' })).toBeNull();
		expect(toColumns(['id: uuid', { name: 'total', type: 'decimal' }, null, 7])).toEqual([
			{ name: 'id', type: 'uuid' },
			{ name: 'total', type: 'decimal' }
		]);
		expect(toColumns('id: uuid')).toEqual([{ name: 'id', type: 'uuid' }]);
		expect(toColumns(undefined)).toEqual([]);
	});

	it('gives a new column an id no other column has', () => {
		expect(newColumnId([])).toBe('c1');
		expect(newColumnId([{ id: 'c2', name: 'a' }, { name: 'b' }])).toBe('c3');
		expect(newColumnId([{ id: 'c3', name: 'a' }, { id: 'c1', name: 'b' }])).toBe('c4');
	});
});

describe('the table block', () => {
	const many = Array.from({ length: 14 }, (_, i) => ({ name: `col_${i}`, type: 'text' }));

	it('shows up to its most rows, then counts the rest on the last', () => {
		expect(tableRows(many.slice(0, TABLE.max)).more).toBe(0);
		const { shown, more } = tableRows(many);
		expect(shown).toHaveLength(TABLE.max - 1);
		expect(more).toBe(14 - (TABLE.max - 1));
	});

	it('grows with its rows and its subtitle', () => {
		const one = tableHeight('', many.slice(0, 1));
		expect(tableHeight('', many.slice(0, 2)) - one).toBe(TABLE.row);
		expect(tableHeight('One row per order', many.slice(0, 1)) - one).toBe(TABLE.subTop + TABLE.subLine);
		expect(tableHeight('', many)).toBe(tableHeight('', many.slice(0, TABLE.max)));
	});

	it('shares its width between key badges, names and types', () => {
		const plain = tableWidths([{ name: 'id', type: 'uuid' }], 260);
		expect(plain.key).toBe(0);
		expect(plain.type).toBeGreaterThan(0);
		expect(plain.key + plain.name + plain.type + TABLE.gap).toBe(260 - 2 * TABLE.padX);
		const keyed = tableWidths([{ name: 'id', type: 'a very long type name that would crowd', key: 'pk' }], 260);
		expect(keyed.key).toBe(TABLE.keyW);
		expect(keyed.type).toBeLessThanOrEqual(Math.floor((260 - 2 * TABLE.padX - TABLE.keyW) * 0.45));
		expect(tableWidths([{ name: 'id' }], 260).type).toBe(0);
	});

	const doc: DaidalDoc = {
		version: 1,
		nodes: [
			{
				id: 'orders',
				name: 'orders',
				type: 'table',
				subtitle: 'One row per order',
				layout: { x: 0, y: 0, w: 280 },
				columns: [
					{ id: 'c1', name: 'id', type: 'uuid', key: 'pk' },
					{ id: 'c2', name: 'customer_id', type: 'uuid', key: 'fk' },
					{ id: 'c3', name: 'placed_at', type: 'timestamptz' }
				]
			},
			{ id: 'cls', name: 'Order', type: 'class', columns: [{ name: 'id', type: 'uuid' }] },
			{ id: 'empty', name: 'audit', type: 'table', members: ['id: uuid'] }
		]
	};

	it('draws a Table with columns as a table block, its height from its rows, and nothing else as one', () => {
		const scene = toScene(doc);
		expect(scene.nodes[0]).toMatchObject({ table: true, code: false, c4: null });
		expect(scene.nodes[0].h).toBe(tableHeight('One row per order', doc.nodes![0].columns!));
		expect(scene.nodes[1].table).toBe(false);
		// A Table without columns keeps its members as a code block, as it always drew.
		expect(scene.nodes[2]).toMatchObject({ table: false, code: true });
	});

	it('is a table block in a C4 diagram too', () => {
		const scene = toScene({ ...doc, diagram: { kind: 'c4-container' } });
		expect(scene.nodes[0]).toMatchObject({ table: true, c4: null });
	});

	it('exports each column with its key badge, name and type', () => {
		const scene = toScene(doc);
		const { svg } = toSvg(scene, { on: tagsOn(scene, null) });
		for (const s of ['>PK<', '>FK<', '>id<', '>customer_id<', '>placed_at<', '>timestamptz<', '>One row per order<']) expect(svg).toContain(s);
		expect(svg).not.toContain('>UQ<');
	});

	it('counts the columns it leaves out', () => {
		const scene = toScene({ version: 1, nodes: [{ id: 't', name: 't', type: 'table', columns: many }] });
		const { svg } = toSvg(scene, { on: {} });
		expect(svg).toContain(`>+${14 - (TABLE.max - 1)} more<`);
	});
});

describe('columns in a config', () => {
	it('reads columns as lines or maps and writes them back as maps', () => {
		const { doc } = readConfig('nodes:\n  - id: t\n    type: table\n    columns:\n      - PK id: uuid\n      - { name: customer_id, type: uuid, key: FK }\n', { version: 1 }, 'replace');
		expect(doc.nodes![0].columns).toEqual([
			{ name: 'id', type: 'uuid', key: 'pk' },
			{ name: 'customer_id', type: 'uuid', key: 'fk' }
		]);
		expect(readConfig(configText(doc, 'yaml'), doc, 'replace').doc).toEqual(doc);
	});

	it('says which column is missing a name or has a key it does not know', () => {
		expect(() => readConfig('nodes:\n  - id: t\n    columns:\n      - { type: uuid }\n', { version: 1 }, 'replace')).toThrow('nodes[0].columns[0]: every column needs a name');
		expect(() => readConfig('nodes:\n  - id: t\n    columns:\n      - { name: id, key: index }\n', { version: 1 }, 'replace')).toThrow('nodes[0].columns[0].key: "index" isn\'t one of pk, fk, unique');
		expect(() => readConfig('nodes:\n  - id: t\n    columns: 4\n', { version: 1 }, 'replace')).toThrow('nodes[0].columns: a list of columns');
	});

	it('leaves an empty list of columns out', () => {
		const { doc } = readConfig('nodes:\n  - id: t\n    columns: []\n', { version: 1 }, 'replace');
		expect(doc.nodes![0]).not.toHaveProperty('columns');
	});
});

describe('column ids', () => {
	it('gives every column an id, keeping the ones it has and never two the same', () => {
		expect(withColumnIds([{ name: 'a' }, { id: 'c1', name: 'b' }, { id: 'c1', name: 'c' }])).toEqual([
			{ id: 'c3', name: 'a' },
			{ id: 'c1', name: 'b' },
			{ id: 'c5', name: 'c' }
		]);
	});
});
