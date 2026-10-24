import { describe, expect, it } from 'vitest';
import { SAMPLE } from '../fixtures/docs';
import { bounds, isHidden, NODE_H, parseAnchor, slug, tagGroups, tagsOn, toScene, typeName } from './model';

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
