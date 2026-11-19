import type { DaidalDoc } from '../types';

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
