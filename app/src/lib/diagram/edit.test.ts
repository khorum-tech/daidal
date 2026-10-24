import { describe, expect, it } from 'vitest';
import type { SkopeDoc } from '../types';
import { addNode, duplicateNode, freeSpot, hostOf, linkUrl, newNodeId, removeNode, updateNode } from './edit';
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
