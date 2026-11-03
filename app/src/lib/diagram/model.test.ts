import { describe, expect, it } from 'vitest';
import { SAMPLE } from '../fixtures/docs';
import { catalogue } from './icons';
import { bounds, ICON_CARD, iconScene, isColor, isHidden, NODE_H, parseAnchor, slug, tagGroups, tagsOn, toScene, typeName } from './model';

describe('typeName', () => {
	it("turns a slug back into the prototype's own type name", () => {
		expect(typeName('web-app')).toBe('Web App');
		expect(typeName('api-gateway')).toBe('API Gateway');
		expect(typeName('ci-cd-pipeline')).toBe('CI/CD Pipeline');
	});
	it('title-cases a type the catalogue does not know, and defaults to Service', () => {
		expect(typeName('rule_engine')).toBe('Rule Engine');
		expect(typeName('')).toBe('Service');
	});
	it('slugs as the prototype does', () => {
		expect(slug('  Web App! ')).toBe('web-app');
		expect(slug('')).toBe('unspecified');
	});
});

describe('parseAnchor', () => {
	it('reads long and short side names and clamps the position', () => {
		expect(parseAnchor('left:0.25')).toEqual({ side: 'l', t: 0.25 });
		expect(parseAnchor('b:7')).toEqual({ side: 'b', t: 1 });
		expect(parseAnchor('Top:x')).toEqual({ side: 't', t: 0.5 });
	});
	it('treats anything else as an auto end', () => {
		expect(parseAnchor('middle:0.5')).toBeNull();
		expect(parseAnchor(undefined)).toBeNull();
	});
});

describe('toScene', () => {
	const scene = toScene(SAMPLE);

	it('fills in the defaults the prototype uses', () => {
		const shop = scene.nodes.find(n => n.id === 'shop')!;
		expect(shop).toMatchObject({ type: 'Web App', sub: 'SvelteKit', w: 190, h: NODE_H, isText: false });
		expect(scene.nodes.find(n => n.id === 'db')!.h).toBe(100);
		expect(scene.nodes.find(n => n.id === 'note')!.isText).toBe(true);
		const edge = scene.edges[0];
		expect(edge).toMatchObject({ style: 'solid', dir: 'forward', width: 1.4, route: null, showLabel: true, fromA: null });
		expect(scene.boundaries[0]).toMatchObject({ pos: 'outside-tr', bs: 'solid', bw: 2 });
	});

	it('drops tags a node names that the diagram does not define', () => {
		const s = toScene({ version: 1, tags: { a: { label: 'A', color: '#fff' } }, nodes: [{ id: 'n', name: 'N', type: 'service', tags: ['a', 'ghost'] }] });
		expect(s.nodes[0].tags).toEqual(['a']);
		expect(s.tags[0].group).toBe('Ungrouped');
	});

	it('starts on the saved view when it exists', () => {
		expect(scene.initialView).toBe('Request path');
		expect(toScene({ ...SAMPLE, diagram: { view: 'Gone' } }).initialView).toBeNull();
	});

	it('copes with an empty document', () => {
		const s = toScene({ version: 1 });
		expect(s).toMatchObject({ nodes: [], edges: [], boundaries: [], tags: [], views: [] });
		expect(bounds(s)).toEqual({ x: 0, y: 0, w: 1240, h: 800 });
	});
});

describe('tags and views', () => {
	const scene = toScene(SAMPLE);

	it("switches on a view's tags, or all of them", () => {
		expect(tagsOn(scene, 'Request path')).toEqual({ web: true, api: true, data: false, obs: false });
		expect(tagsOn(scene, null)).toEqual({ web: true, api: true, data: true, obs: true });
	});

	it('ghosts a tagged node with none of its tags on, never an untagged one', () => {
		const on = tagsOn(scene, 'Request path');
		expect(isHidden({ tags: ['data'] }, on)).toBe(true);
		expect(isHidden({ tags: ['data', 'api'] }, on)).toBe(false);
		expect(isHidden({ tags: [] }, on)).toBe(false);
	});

	it('groups tags in the order the groups first appear', () => {
		expect(tagGroups(scene).map(g => [g.name, g.tags.map(t => t.key)])).toEqual([
			['Layer', ['web', 'api', 'data']],
			['Concern', ['obs']]
		]);
	});

	it('measures the box around every node and boundary', () => {
		expect(bounds(scene)).toEqual({ x: 60, y: 100, w: 800, h: 408 });
	});
});

describe('iconScene', () => {
	it('shrinks each card to a square on its own centre and leaves free text alone', () => {
		const scene = toScene({
			version: 1,
			nodes: [
				{ id: 'a', name: 'A', type: 'service', layout: { x: 100, y: 200, w: 190, h: 88 } },
				{ id: 't', name: 'Note', type: 'text', layout: { x: 10, y: 10 } }
			]
		});
		const out = iconScene(scene);
		const a = out.nodes.find(n => n.id === 'a')!;
		expect(a).toMatchObject({ w: ICON_CARD, h: ICON_CARD, x: 100 + (190 - ICON_CARD) / 2, y: 200 + (88 - ICON_CARD) / 2 });
		expect(out.nodes.find(n => n.id === 't')).toEqual(scene.nodes.find(n => n.id === 't'));
		expect(scene.nodes.find(n => n.id === 'a')!.w).toBe(190);
	});
});

describe('a node’s icon', () => {
	const cats = catalogue([{ name: 'Billing Agent', category: 'AI', icon: 'robot' }]);
	const doc = (node: Record<string, unknown>) => ({ version: 1 as const, nodes: [{ id: 'n', name: 'N', ...node }] as never });

	it('comes from its type, read against the workspace’s catalogue', () => {
		expect(toScene(doc({ type: 'database' })).nodes[0]).toMatchObject({ type: 'Database', icon: 'database', ownIcon: null });
		expect(toScene(doc({ type: 'billing-agent' }), cats).nodes[0]).toMatchObject({ type: 'Billing Agent', icon: 'robot' });
		expect(toScene(doc({ type: 'billing-agent' })).nodes[0]).toMatchObject({ type: 'Billing Agent', icon: 'cube' });
		expect(typeName('billing-agent', cats)).toBe('Billing Agent');
	});

	it('is its own when it has one from the library, else its type’s', () => {
		expect(toScene(doc({ type: 'database', icon: 'vault' })).nodes[0]).toMatchObject({ icon: 'vault', ownIcon: 'vault' });
		expect(toScene(doc({ type: 'database', icon: 'trash' })).nodes[0]).toMatchObject({ icon: 'database', ownIcon: null });
	});
});

describe('isColor', () => {
	it('takes hex, rgb() and hsl() with plain numbers, and nothing that could carry CSS or markup', () => {
		for (const ok of ['#abc', '#A1B2C3', '#a1b2c3d4', 'rgb(1, 2, 3)', 'rgba(1 2 3 / 50%)', 'hsl(200, 50%, 40%)']) expect(isColor(ok), ok).toBe(true);
		for (const bad of ['red', 'red;position:fixed', 'url(https://evil/x)', '"/><script>', '#12', 'rgb(1,2,3);x:y', 12, undefined]) expect(isColor(bad), String(bad)).toBe(false);
	});

	it('gives a tag with a colour Skope can’t use the plain grey on the canvas', () => {
		const scene = toScene({ version: 1, tags: { a: { label: 'A', color: 'red;inset:0' } }, nodes: [] });
		expect(scene.tags[0].color).toBe('#9397ab');
	});
});
