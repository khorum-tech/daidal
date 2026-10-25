import { describe, expect, it } from 'vitest';
import type { SkopeDoc } from '../types';
import { addBoundary, addEdge, addNode, connectToNew, contentsOf, duplicateBoundary, duplicateNode, endSide, freeSpot, hostOf, linkUrl, moveBoundary, newNodeId, removeBoundary, removeEdge, removeNode, resizeBoundary, reverseEdge, updateBoundary, updateEdge, updateNode } from './edit';
import { toScene } from './model';

const base = (): SkopeDoc => ({
	version: 1,
	nodes: [
		{ id: 'api', name: 'API', type: 'service', layout: { x: 100, y: 100 }, tags: ['core'] },
		{ id: 'db', name: 'Orders DB', type: 'database', layout: { x: 400, y: 100 } }
	],
	edges: [
		{ from: 'api', to: 'db', label: 'SQL' },
		{ from: 'db', to: 'api' }
	]
});

describe('newNodeId', () => {
	it('never repeats an id the document has', () => {
		const now = 1_700_000_000_000;
		const first = newNodeId(base(), now);
		const doc = { ...base(), nodes: [...base().nodes!, { id: first, name: 'x', type: 'service' }] };
		expect(newNodeId(doc, now)).not.toBe(first);
	});
});

describe('addNode', () => {
	it('adds a named node of the type, centred on the point, without touching the original', () => {
		const doc = base();
		const { doc: next, id } = addNode(doc, 'Web App', { x: 500, y: 300 }, 1);
		expect(doc.nodes).toHaveLength(2);
		const node = next.nodes!.find(n => n.id === id)!;
		expect(node).toEqual({ id, name: 'New Web App', type: 'web-app', layout: { x: 405, y: 256 } });
		expect(toScene(next).nodes.find(n => n.id === id)!.type).toBe('Web App');
	});

	it('starts notes and free text wider, with plain names', () => {
		const note = addNode(base(), 'Note', { x: 0, y: 0 }, 1);
		expect(note.doc.nodes!.at(-1)).toMatchObject({ name: 'Note', layout: { w: 200 } });
		const text = addNode(base(), 'Text', { x: 0, y: 0 }, 2);
		expect(text.doc.nodes!.at(-1)).toMatchObject({ name: 'Text', type: 'text', layout: { w: 230 } });
	});
});

describe('freeSpot', () => {
	it('keeps a free spot, and steps a whole card away from one that covers a node', () => {
		// Clear of both nodes (API at 100,100 and Orders DB at 400,100, each 190 × 88).
		expect(freeSpot(base(), { x: 195, y: 444 }, 190)).toEqual({ x: 100, y: 400 });
		// Right on top of API: the nearest free spot is a card's height plus the gap below or above it.
		const spot = freeSpot(base(), { x: 195, y: 144 }, 190);
		expect(spot.x).toBe(100);
		expect(Math.abs(spot.y - 100)).toBe(88 + 24);
	});

	it('never lands a new node on another', () => {
		let doc = base();
		for (let i = 0; i < 6; i++) doc = addNode(doc, 'Service', { x: 195, y: 144 }, i).doc;
		const boxes = toScene(doc).nodes;
		for (const a of boxes)
			for (const b of boxes)
				if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
	});
});

describe('removeNode', () => {
	it('drops the node and its connections only', () => {
		const next = removeNode(base(), 'db');
		expect(next.nodes!.map(n => n.id)).toEqual(['api']);
		expect(next.edges).toEqual([]);
		expect(removeNode(base(), 'nope')).toEqual(base());
	});
});

describe('duplicateNode', () => {
	it('copies everything but the id, nudged, and leaves connections with the original', () => {
		const { doc, id } = duplicateNode(base(), 'api', 1)!;
		const copy = doc.nodes!.find(n => n.id === id)!;
		expect(copy).toMatchObject({ name: 'API', type: 'service', tags: ['core'], layout: { x: 128, y: 128 } });
		expect(id).not.toBe('api');
		expect(doc.edges).toEqual(base().edges);
		expect(duplicateNode(base(), 'nope')).toBeNull();
	});
});

describe('updateNode', () => {
	it('changes the given fields and slugs the type', () => {
		const next = updateNode(base(), 'api', { name: 'Gateway', type: 'API Gateway', subtitle: 'edge', flags: ['cache'] });
		expect(next.nodes![0]).toMatchObject({ name: 'Gateway', type: 'api-gateway', subtitle: 'edge', flags: ['cache'] });
		expect(next.nodes![1]).toEqual(base().nodes![1]);
	});

	it('leaves empty fields out of the document', () => {
		const next = updateNode(updateNode(base(), 'api', { notes: 'x', links: [{ url: 'https://a' }] }), 'api', { notes: '', tags: [], links: [] });
		expect(next.nodes![0]).toEqual({ id: 'api', name: 'API', type: 'service', layout: { x: 100, y: 100 } });
	});
});

describe('links', () => {
	it('adds a scheme when one is missing', () => {
		expect(linkUrl(' github.com/acme ')).toBe('https://github.com/acme');
		expect(linkUrl('http://x.io')).toBe('http://x.io');
	});

	it('shows a link by its host', () => {
		expect(hostOf('https://www.github.com/acme')).toBe('github.com');
		expect(hostOf('grafana.acme.io/d/1')).toBe('grafana.acme.io');
		expect(hostOf('not a url')).toBe('not a url');
	});
});

describe('connections', () => {
	it('adds one with the defaults and reports where it went', () => {
		const { doc, index } = addEdge(base(), 'db', 'api');
		expect(index).toBe(2);
		expect(doc.edges![2]).toEqual({ from: 'db', to: 'api' });
		expect(base().edges).toHaveLength(2);
	});

	it('connects to a new node dropped on empty canvas', () => {
		const { doc, id, index } = connectToNew(base(), 'api', 'Service', { x: 195, y: 444 }, 1);
		expect(doc.nodes!.find(n => n.id === id)).toMatchObject({ name: 'New Service', layout: { x: 100, y: 400 } });
		expect(doc.edges![index]).toEqual({ from: 'api', to: id });
	});

	it('changes fields, and leaves defaults out of the document', () => {
		let doc = updateEdge(base(), 0, { label: 'reads', line: 'dashed', direction: 'both', width: 2.6, route: 'angled', showLabel: false });
		expect(doc.edges![0]).toEqual({ from: 'api', to: 'db', label: 'reads', line: 'dashed', direction: 'both', width: 2.6, route: 'angled', showLabel: false });
		doc = updateEdge(doc, 0, { label: '', line: 'solid', direction: 'forward', showLabel: true });
		expect(doc.edges![0]).toEqual({ from: 'api', to: 'db', width: 2.6, route: 'angled' });
		expect(doc.edges![1]).toEqual(base().edges![1]);
	});

	it('pins an end to the middle of a side, and puts it back on auto', () => {
		let doc = updateEdge(base(), 0, { fromSide: 'bottom' });
		expect(doc.edges![0].anchors).toEqual({ from: 'bottom:0.5' });
		expect(endSide(doc.edges![0], 'from')).toBe('bottom');
		expect(endSide(doc.edges![0], 'to')).toBeNull();
		expect(toScene(doc).edges[0].fromA).toEqual({ side: 'b', t: 0.5 });
		doc = updateEdge(doc, 0, { toSide: 'left' });
		expect(doc.edges![0].anchors).toEqual({ from: 'bottom:0.5', to: 'left:0.5' });
		doc = updateEdge(doc, 0, { fromSide: null, toSide: null });
		expect(doc.edges![0].anchors).toBeUndefined();
		expect(endSide({ from: 'a', to: 'b', anchors: { to: 'r:0.2' } }, 'to')).toBe('right');
	});

	it('reverses one, swapping its pinned ends', () => {
		const pinned = updateEdge(base(), 0, { fromSide: 'top' });
		expect(reverseEdge(pinned, 0).edges![0]).toEqual({ from: 'db', to: 'api', label: 'SQL', anchors: { to: 'top:0.5' } });
	});

	it('removes one by its place', () => {
		expect(removeEdge(base(), 0).edges).toEqual([{ from: 'db', to: 'api' }]);
	});
});

describe('containers', () => {
	// A container round API (100,100 190×88) only; Orders DB sits outside it.
	const boxed = (moveContents?: boolean): SkopeDoc => ({
		...base(),
		boundaries: [
			{ id: 'zone', label: 'ZONE', layout: { x: 80, y: 80, w: 260, h: 160 }, ...(moveContents === undefined ? {} : { moveContents }) },
			{ id: 'inner', label: 'INNER', layout: { x: 90, y: 200, w: 150, h: 30 } }
		],
		edges: [...base().edges!, { from: 'db', to: 'zone' }]
	});

	it('adds one centred on the point, moving alone', () => {
		const { doc, id } = addBoundary(base(), { x: 500, y: 400 }, 1);
		expect(doc.boundaries!.find(b => b.id === id)).toEqual({ id, label: 'NEW CONTAINER', moveContents: false, layout: { x: 240, y: 230, w: 520, h: 340 } });
	});

	it('finds what sits wholly inside one', () => {
		expect(contentsOf(toScene(boxed()), 'zone')).toEqual({ nodes: ['api'], boxes: ['inner'] });
		expect(contentsOf(toScene(boxed()), 'nope')).toEqual({ nodes: [], boxes: [] });
	});

	it('moves its contents with it, unless it moves alone', () => {
		const moved = moveBoundary(boxed(), 'zone', 100, 130);
		expect(moved.boundaries![0].layout).toEqual({ x: 100, y: 130, w: 260, h: 160 });
		expect(moved.boundaries![1].layout).toEqual({ x: 110, y: 250, w: 150, h: 30 });
		expect(moved.nodes!.find(n => n.id === 'api')!.layout).toEqual({ x: 120, y: 150 });
		expect(moved.nodes!.find(n => n.id === 'db')!.layout).toEqual({ x: 400, y: 100 });

		const alone = moveBoundary(boxed(false), 'zone', 100, 130);
		expect(alone.boundaries![1].layout).toEqual({ x: 90, y: 200, w: 150, h: 30 });
		expect(alone.nodes!.find(n => n.id === 'api')!.layout).toEqual({ x: 100, y: 100 });
	});

	it('resizes one, but not below the smallest size', () => {
		expect(resizeBoundary(boxed(), 'zone', 400.4, 300).boundaries![0].layout).toEqual({ x: 80, y: 80, w: 400, h: 300 });
		expect(resizeBoundary(boxed(), 'zone', 10, 10).boundaries![0].layout).toEqual({ x: 80, y: 80, w: 140, h: 110 });
	});

	it('changes its label and border, and leaves defaults out of the document', () => {
		let doc = updateBoundary(boxed(), 'zone', { label: 'PROD', labelPosition: 'outside-tr', borderWidth: 2, borderStyle: 'solid', moveContents: false });
		expect(doc.boundaries![0]).toEqual({ id: 'zone', label: 'PROD', labelPosition: 'outside-tr', border: { width: 2, style: 'solid' }, moveContents: false, layout: { x: 80, y: 80, w: 260, h: 160 } });
		doc = updateBoundary(doc, 'zone', { label: '', labelPosition: 'inside-bl', borderWidth: 1, borderStyle: 'dashed', moveContents: true });
		expect(doc.boundaries![0]).toEqual({ id: 'zone', layout: { x: 80, y: 80, w: 260, h: 160 } });
	});

	it('duplicates one beside the original, without its contents', () => {
		const { doc, id } = duplicateBoundary(boxed(), 'zone', 1)!;
		expect(doc.boundaries!.find(b => b.id === id)).toMatchObject({ label: 'ZONE copy', layout: { x: 120, y: 120, w: 260, h: 160 } });
		expect(doc.nodes).toHaveLength(2);
		expect(duplicateBoundary(boxed(), 'nope')).toBeNull();
	});

	it('removes one with its connections, leaving what was inside', () => {
		const doc = removeBoundary(boxed(), 'zone');
		expect(doc.boundaries!.map(b => b.id)).toEqual(['inner']);
		expect(doc.edges!.some(e => e.to === 'zone')).toBe(false);
		expect(doc.nodes).toHaveLength(2);
	});
});
