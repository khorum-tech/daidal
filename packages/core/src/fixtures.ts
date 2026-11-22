import type { DaidalDoc } from './types';

/** A small diagram that uses each thing the canvas draws: tags in two groups, views, a boundary, every edge option. */
export const SAMPLE: DaidalDoc = {
	version: 1,
	diagram: { id: 'checkout', name: 'checkout', kind: 'c4', view: 'Request path' },
	tags: {
		web: { label: 'Web', color: '#b5abfc', group: 'Layer' },
		api: { label: 'API', color: '#968ae0', group: 'Layer' },
		data: { label: 'Data', color: '#796cbf', group: 'Layer' },
		obs: { label: 'Observability', color: '#9397ab', group: 'Concern' }
	},
	views: [
		{ name: 'Request path', tags: ['web', 'api'] },
		{ name: 'Everything tagged', tags: ['web', 'api', 'data', 'obs'] }
	],
	nodes: [
		{ id: 'shop', name: 'Shop', type: 'web-app', subtitle: 'SvelteKit', tags: ['web'], layout: { x: 60, y: 150, w: 190 }, links: [{ label: 'Docs', url: 'example.com/docs' }] },
		{ id: 'gw', name: 'Gateway', type: 'api-gateway', tags: ['api'], layout: { x: 340, y: 150, w: 190 }, notes: 'The one way in.' },
		{ id: 'db', name: 'Orders DB', type: 'database', flags: ['db'], tags: ['data'], layout: { x: 620, y: 150, w: 190, h: 100 } },
		{ id: 'otel', name: 'Collector', type: 'telemetry', tags: ['obs'], layout: { x: 60, y: 420, w: 190 } },
		{ id: 'note', name: 'Draft — not agreed yet', type: 'text', tags: [], layout: { x: 620, y: 420, w: 240 } }
	],
	edges: [
		{ from: 'shop', to: 'gw', label: 'HTTPS' },
		{ from: 'gw', to: 'db', label: 'SQL', line: 'dashed', route: 'angled' },
		{ from: 'otel', to: 'gw', label: 'traces', line: 'dotted', showLabel: false, direction: 'both', width: 1 },
		{ from: 'gw', to: 'zone', direction: 'back', anchors: { from: 'bottom:0.25' } }
	],
	boundaries: [{ id: 'zone', label: 'Prod', layout: { x: 300, y: 100, w: 560, h: 220 }, labelPosition: 'outside-tr', border: { style: 'solid', width: 2 } }]
};

/** [T] with every optional field made required, all the way down: a value of it sets each field the format has. */
export type Full<T> = T extends (infer U)[] ? Full<U>[] : T extends object ? { [K in keyof T]-?: Full<T[K]> } : T;

/**
 * A diagram that sets every field of the document format, with a code block whose members and functions are all
 * filled in. Typed as Full<DaidalDoc>, so a field added to DocNode, DocFunction, DocEdge or any other part of the
 * format fails the typecheck until it is given a value here, and then the contract tests (contract.test.ts) check
 * that the config export, the config reader and the SVG renderer all handle it.
 */
export const EVERY_FIELD: Full<DaidalDoc> = {
	version: 1,
	diagram: { id: 'postings', name: 'Postings', kind: 'c4-code', view: 'Core' },
	tags: { core: { label: 'Core', color: '#b5abfc', group: 'Layer' } },
	views: [{ name: 'Core', tags: ['core'], locked: true }],
	nodes: [
		{
			id: 'checker',
			name: 'BalanceChecker',
			type: 'class',
			icon: 'archive',
			subtitle: 'Says whether a batch balances',
			flags: ['db'],
			tags: ['core'],
			layout: { x: 60, y: 80, w: 420, h: 88 },
			notes: 'Runs before every posting.',
			members: ['rules: List<Rule>', 'clock: Clock'],
			functions: [
				{ name: 'check', params: [{ name: 'batch', type: 'Batch' }], returns: 'Verdict', notes: 'Balanced or not, per currency.' },
				{ name: 'explain', params: [{ name: 'batch', type: 'Map<K, V>' }], returns: 'List<Imbalance>', notes: 'Why not.' }
			],
			language: 'kotlin',
			path: 'postings/src/balance/BalanceChecker.kt',
			links: [{ label: 'Source', url: 'example.com/checker', diagram: 'ledger', view: 'Core' }],
			ref: 'ledger#checker'
		}
	],
	edges: [{ from: 'checker', to: 'zone', label: 'lives in', showLabel: true, line: 'dashed', direction: 'forward', width: 2, route: 'angled', anchors: { from: 'right:0.5', to: 'left:0.5' } }],
	boundaries: [{ id: 'zone', label: 'Postings', border: { width: 2, style: 'dotted' }, moveContents: true, layout: { x: 20, y: 20, w: 600, h: 300 }, labelPosition: 'inside-tl', ref: 'ledger#postings' }]
};
