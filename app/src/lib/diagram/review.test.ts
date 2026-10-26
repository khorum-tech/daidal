import { describe, expect, it } from 'vitest';
import type { SkopeDoc, Snapshot } from '../types';
import { applyChange, diffDocs, pending, withNeeded } from './review';

const v1 = (): SkopeDoc => ({
	version: 1,
	tags: { core: { label: 'Core', color: '#fff' } },
	nodes: [
		{ id: 'api', name: 'API', type: 'service', layout: { x: 100, y: 100 }, tags: ['core'] },
		{ id: 'db', name: 'Orders DB', type: 'database', layout: { x: 400, y: 100 } }
	],
	edges: [{ from: 'api', to: 'db', label: 'SQL' }]
});

const v2 = (): SkopeDoc => ({
	version: 1,
	tags: { core: { label: 'Core', color: '#fff' }, data: { label: 'Data', color: '#000' } },
	nodes: [
		{ id: 'api', name: 'API', type: 'service', subtitle: 'Kotlin', layout: { x: 120, y: 100 }, tags: ['core'] },
		{ id: 'db', name: 'Orders DB', type: 'database', layout: { x: 400, y: 100 }, tags: ['data'] },
		{ id: 'q', name: 'Events', type: 'queue', layout: { x: 400, y: 300 }, tags: ['data'] }
	],
	edges: [
		{ from: 'api', to: 'db', label: 'SQL', line: 'dashed' },
		{ from: 'db', to: 'q' }
	],
	boundaries: [{ id: 'zone', label: 'Prod', layout: { x: 40, y: 40, w: 600, h: 400 } }]
});

describe('diffDocs', () => {
	it('names every change between two versions, keyed under the newer snapshot', () => {
		const changes = diffDocs(v1(), v2(), 's2');
		expect(changes.map(c => [c.id, c.label, c.detail])).toEqual([
			['s2:na:q', 'Add “Events”', 'Queue'],
			['s2:ne:api', 'Update “API”', 'subtitle → Kotlin'],
			['s2:nm:api', 'Move “API”', 'to 120, 100'],
			['s2:nt:db', 'Retag “Orders DB”', 'Data'],
			['s2:ea:db>q', 'Connect Orders DB → Events', 'no label'],
			['s2:ee:api>db', 'Update API → Orders DB', 'line → dashed'],
			['s2:ba:zone', 'Add container “Prod”', '']
		]);
	});

	it('sees removals the other way round', () => {
		expect(diffDocs(v2(), v1(), 's3').map(c => c.id)).toEqual(['s3:nd:q', 's3:ne:api', 's3:nm:api', 's3:nt:db', 's3:ed:db>q', 's3:ee:api>db', 's3:bd:zone']);
	});

	it('finds nothing between equal documents', () => {
		expect(diffDocs(v1(), v1(), 'x')).toEqual([]);
	});
});

describe('applyChange', () => {
	const changes = diffDocs(v1(), v2(), 's2');
	const one = (id: string) => changes.find(c => c.id === id)!;

	it('brings a node in with the tags it uses', () => {
		const doc = applyChange(v1(), one('s2:na:q'));
		expect(doc.nodes!.at(-1)).toEqual(v2().nodes![2]);
		expect(doc.tags!.data).toEqual({ label: 'Data', color: '#000' });
	});

	it('takes only the fields that changed, and the place only on a move', () => {
		const follower: SkopeDoc = { ...v1(), nodes: [{ ...v1().nodes![0], notes: 'mine', layout: { x: 5, y: 5, w: 220 } }, v1().nodes![1]] };
		const edited = applyChange(follower, one('s2:ne:api'));
		expect(edited.nodes![0]).toMatchObject({ subtitle: 'Kotlin', layout: { x: 5, y: 5, w: 220 } });
		expect(edited.nodes![0].notes).toBe('mine'); // the lead changed the subtitle, so nothing else is taken
		const moved = applyChange(follower, one('s2:nm:api'));
		expect(moved.nodes![0].layout).toEqual({ x: 120, y: 100, w: 220 });
		expect(moved.nodes![0].notes).toBe('mine');
	});

	it('retags, connects, restyles and adds a container', () => {
		let doc = v1();
		for (const id of ['s2:nt:db', 's2:na:q', 's2:ea:db>q', 's2:ee:api>db', 's2:ba:zone']) doc = applyChange(doc, one(id));
		expect(doc.nodes!.find(n => n.id === 'db')!.tags).toEqual(['data']);
		expect(doc.edges).toEqual([
			{ from: 'api', to: 'db', label: 'SQL', line: 'dashed' },
			{ from: 'db', to: 'q' }
		]);
		expect(doc.boundaries).toEqual(v2().boundaries);
	});

	it('removes, and does nothing twice', () => {
		const back = diffDocs(v2(), v1(), 's3');
		let doc = v2();
		for (const c of back.filter(c => ['node-del', 'edge-del', 'box-del'].includes(c.kind))) doc = applyChange(doc, c);
		expect(doc.nodes!.map(n => n.id)).toEqual(['api', 'db']);
		expect(doc.edges!.map(e => `${e.from}>${e.to}`)).toEqual(['api>db']);
		expect(doc.boundaries).toEqual([]);
		const connect = one('s2:ea:db>q');
		const twice = applyChange(applyChange(v2(), connect), connect);
		expect(twice.edges).toHaveLength(2);
	});
});

describe('pending', () => {
	const snap = (id: string, doc: SkopeDoc): Snapshot => ({ id, label: id, authorEmail: 'a@example.com', doc, createdAt: 0 });

	it("groups what each snapshot after the synced one changed, leaving out ones that changed nothing", () => {
		const snaps = [snap('s1', v1()), snap('s2', v2()), snap('s3', v2()), snap('s4', v1())];
		const groups = pending(snaps, 's2');
		expect(groups.map(g => g.snapshot.id)).toEqual(['s4']);
		expect(groups[0].changes[0].id).toBe('s4:nd:q');
		expect(pending(snaps, 's4')).toEqual([]);
	});

	it('starts from the first snapshot when synced to nothing the lead still has', () => {
		const snaps = [snap('s1', v1()), snap('s2', v2())];
		expect(pending(snaps, null).map(g => g.snapshot.id)).toEqual(['s2']);
		expect(pending(snaps, 'gone').map(g => g.snapshot.id)).toEqual(['s2']);
	});
});

describe('withNeeded', () => {
	it('brings in a node a chosen connection needs, first', () => {
		const offered = diffDocs(v1(), v2(), 's2');
		const connect = offered.find(c => c.id === 's2:ea:db>q')!;
		expect(withNeeded(v1(), [connect], offered).map(c => c.id)).toEqual(['s2:na:q', 's2:ea:db>q']);
		// Not when the node is here already, or chosen too.
		expect(withNeeded(v2(), [connect], offered).map(c => c.id)).toEqual(['s2:ea:db>q']);
		const add = offered.find(c => c.id === 's2:na:q')!;
		expect(withNeeded(v1(), [add, connect], offered).map(c => c.id)).toEqual(['s2:na:q', 's2:ea:db>q']);
	});
});
