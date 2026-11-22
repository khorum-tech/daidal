import { describe, expect, it } from 'vitest';
import type { DaidalDoc } from './types';
import { ConfigError, configText, langOf, readConfig } from './config';

const current = (): DaidalDoc => ({
	version: 1,
	diagram: { name: 'checkout', kind: 'c4' },
	tags: { core: { label: 'Core', color: '#fff', group: 'Layer' } },
	views: [{ name: 'Main', tags: ['core'] }],
	nodes: [
		{ id: 'api', name: 'API', type: 'service', tags: ['core'], notes: 'mine', layout: { x: 0, y: 0, w: 220 } },
		{ id: 'db', name: 'Orders DB', type: 'database', layout: { x: 300, y: 0 } }
	],
	edges: [{ from: 'api', to: 'db', label: 'SQL' }]
});

const fails = (text: string, mode: 'replace' | 'merge' = 'replace') => {
	try {
		readConfig(text, current(), mode);
	} catch (e) {
		return e as ConfigError;
	}
	throw new Error('expected it to fail');
};

describe('config', () => {
	it('writes the document as YAML or JSON, and reads either back unchanged on replace', () => {
		for (const lang of ['yaml', 'json'] as const) {
			const text = configText(current(), lang);
			expect(langOf(text)).toBe(lang);
			expect(readConfig(text, current(), 'replace').doc).toEqual({ ...current(), boundaries: [] });
		}
		expect(configText(current(), 'yaml').startsWith('# checkout: a Daidal diagram config\n')).toBe(true);
	});

	it('replaces the diagram, keeping its name, slugging types and making up missing tags', () => {
		const { doc, summary } = readConfig('nodes:\n  - id: q\n    name: Events\n    type: Message Queue\n    tags: [async]\ndiagram:\n  name: ignored', current(), 'replace');
		expect(doc.diagram?.name).toBe('checkout');
		expect(doc.nodes).toEqual([{ id: 'q', name: 'Events', type: 'message-queue', tags: ['async'] }]);
		expect(doc.tags!.async).toMatchObject({ label: 'Async', group: 'Unlabelled' });
		expect(doc.edges).toEqual([]);
		expect(summary).toBe('Replaced with 1 node');
	});

	it('merges in: updates nodes by id, adds new ones and connections, keeps the rest', () => {
		const text = JSON.stringify({ nodes: [{ id: 'api', name: 'Gateway', type: 'service', layout: { x: 40, y: 0 } }, { id: 'q', name: 'Events', type: 'queue' }], edges: [{ from: 'db', to: 'q' }, { from: 'api', to: 'db' }] });
		const { doc, summary } = readConfig(text, current(), 'merge');
		expect(doc.nodes![0]).toEqual({ id: 'api', name: 'Gateway', type: 'service', tags: ['core'], notes: 'mine', layout: { x: 40, y: 0, w: 220 } });
		expect(doc.nodes!.map(n => n.id)).toEqual(['api', 'db', 'q']);
		expect(doc.edges).toEqual([{ from: 'api', to: 'db', label: 'SQL' }, { from: 'db', to: 'q' }]);
		expect(doc.views).toEqual(current().views);
		expect(summary).toBe('Merged in: 1 new node, 1 updated, 1 new connection');
	});

	it('refuses configs that do not hold together, saying why', () => {
		expect(fails('[1, 2]').message).toMatch(/map of sections/);
		expect(fails('{ "nodes": [] }').message).toMatch(/No nodes/);
		expect(fails('nodes:\n  - name: A').message).toMatch(/needs an id/);
		expect(fails('nodes:\n  - id: a\n  - id: a').message).toMatch(/share the id “a”/);
		expect(fails('nodes:\n  - id: a\nedges:\n  - from: a\n    to: api').message).toMatch(/no node or container with the id “api”/);
		expect(fails('version: 2\nnodes:\n  - id: a').message).toMatch(/version 2/);
		expect(fails('{ "nodes": ').message).toMatch(/isn't valid JSON/);
		expect(fails('nodes:\n  - id: a\n   bad').line).toBe(3);
		expect(fails('tags:\n  a: { label: A, color: "red;position:fixed" }\nnodes:\n  - id: a').message).toMatch(/tags\.a: “red;position:fixed” isn't a colour/);
	});

	it('reads connections and containers as edges and boundaries, and plain x and y as the layout', () => {
		const text = 'nodes:\n  - id: q\n    x: 900\n    y: 420\nconnections:\n  - from: api\n    to: q\ncontainers:\n  - id: box\n    label: Box\n    x: 0\n    y: 0\n    w: 300\n    h: 200';
		const { doc, summary } = readConfig(text, current(), 'merge');
		expect(doc.nodes!.at(-1)).toEqual({ id: 'q', name: 'q', type: 'service', layout: { x: 900, y: 420 } });
		expect(doc.edges!.at(-1)).toEqual({ from: 'api', to: 'q' });
		expect(doc.boundaries!.at(-1)).toEqual({ id: 'box', label: 'Box', layout: { x: 0, y: 0, w: 300, h: 200 } });
		expect(summary).toBe('Merged in: 1 new node, 1 new connection');
	});

	it('places a node whose layout is a flow map inside a flow map', () => {
		const { doc } = readConfig('nodes:\n  - { id: q, name: Queue, type: queue, layout: { x: 60, y: 80 } }', current(), 'merge');
		expect(doc.nodes!.at(-1)).toEqual({ id: 'q', name: 'Queue', type: 'queue', layout: { x: 60, y: 80 } });
	});

	it('keeps a layout over a plain x and y, and refuses unknown or doubled sections', () => {
		const { doc } = readConfig('nodes:\n  - id: q\n    x: 1\n    layout: { x: 5, y: 6 }', current(), 'merge');
		expect(doc.nodes!.at(-1)!.layout).toEqual({ x: 5, y: 6 });
		expect(fails('nodes:\n  - id: a\nlinks: []').message).toMatch(/Unknown section “links”: a config has version, diagram, tags, views, nodes, edges, boundaries/);
		expect(fails('nodes:\n  - id: a\nconnections: []\nedges: []').message).toBe('Use connections or edges, not both');
	});

	it('merges a node that names only some fields without resetting its name or type', () => {
		const { doc, summary } = readConfig('nodes:\n  - id: db\n    subtitle: books', current(), 'merge');
		expect(doc.nodes!.find(n => n.id === 'db')).toEqual({ id: 'db', name: 'Orders DB', type: 'database', subtitle: 'books', layout: { x: 300, y: 0 } });
		expect(summary).toBe('Merged in: 1 updated');
	});

	it('lets a merged connection end on a node the diagram already has', () => {
		const { doc } = readConfig('nodes:\n  - id: q\nedges:\n  - from: api\n    to: q', current(), 'merge');
		expect(doc.edges!.at(-1)).toEqual({ from: 'api', to: 'q' });
	});

	it('reads a code block: members as a list (or one name) and a path, and writes them back', () => {
		const { doc } = readConfig('nodes:\n  - id: p\n    name: Parser\n    type: Class\n    path: src/parser.ts\n    members:\n      - parse(text)\n      - "emit(): void"\n  - id: q\n    members: only()\n  - id: r\n    members: []', current(), 'replace');
		expect(doc.nodes![0]).toMatchObject({ path: 'src/parser.ts', members: ['parse(text)', 'emit(): void'] });
		expect(doc.nodes![1].members).toEqual(['only()']);
		expect(doc.nodes![2]).not.toHaveProperty('members');
		const again = readConfig(configText(doc, 'yaml'), current(), 'replace').doc;
		expect(again.nodes![0]).toMatchObject({ path: 'src/parser.ts', members: ['parse(text)', 'emit(): void'] });
	});

	it('reads functions as entries or signatures, and writes them back as entries', () => {
		const text = [
			'nodes:',
			'  - id: p',
			'    name: BalanceChecker',
			'    type: Class',
			'    functions:',
			'      - name: check',
			'        params:',
			'          - name: batch',
			'            type: Batch',
			'          - "strict: Boolean"',
			'        returns: Verdict',
			'        notes: Rejects a batch that does not balance.',
			'      - "sum(lines: Map<Currency, Money>): Money"',
			'      - reset()',
			'  - id: q',
			'    functions: []'
		].join('\n');
		const { doc } = readConfig(text, current(), 'replace');
		const fns = [
			{ name: 'check', params: [{ name: 'batch', type: 'Batch' }, { name: 'strict', type: 'Boolean' }], returns: 'Verdict', notes: 'Rejects a batch that does not balance.' },
			{ name: 'sum', params: [{ name: 'lines', type: 'Map<Currency, Money>' }], returns: 'Money' },
			{ name: 'reset' }
		];
		expect(doc.nodes![0].functions).toEqual(fns);
		expect(doc.nodes![1]).not.toHaveProperty('functions');
		for (const lang of ['yaml', 'json'] as const) expect(readConfig(configText(doc, lang), current(), 'replace').doc.nodes![0].functions, lang).toEqual(fns);
		expect(configText(doc, 'yaml')).toContain('    functions:\n      - name: check\n        params:\n          - name: batch\n            type: Batch\n');
	});

	it('says which function has no name', () => {
		expect(() => readConfig('nodes:\n  - id: p\n    functions:\n      - returns: Verdict', current(), 'replace')).toThrow('nodes[0].functions[0]: every function needs a name');
		expect(() => readConfig('nodes:\n  - id: p\n    functions: 7', current(), 'replace')).toThrow('nodes[0].functions');
	});
});
