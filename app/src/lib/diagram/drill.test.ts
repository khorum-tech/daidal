import { describe, expect, it } from 'vitest';
import type { DaidalDoc } from '../types';
import { childDoc, parentDoc, refTo, SCOPE } from './drill';

const parent: DaidalDoc = {
	version: 1,
	diagram: { name: 'ledger', kind: 'c4-container' },
	tags: { web: { label: 'Web', color: '#968ae0' }, data: { label: 'Data', color: '#796cbf' }, unused: { label: 'Unused', color: '#9397ab' } },
	nodes: [
		{ id: 'console', name: 'Console', type: 'web-app', tags: ['web'], layout: { x: 0, y: 0 } },
		{ id: 'postings', name: 'Postings', type: 'service', subtitle: 'Kotlin', layout: { x: 300, y: 0 } },
		{ id: 'journal', name: 'Journal', type: 'database', tags: ['data'], layout: { x: 600, y: 0 } },
		{ id: 'cache', name: 'Cache', type: 'cache', layout: { x: 600, y: 300 } },
		{ id: 'alone', name: 'Alone', type: 'service', layout: { x: 900, y: 0 } }
	],
	edges: [
		{ from: 'console', to: 'postings', label: 'HTTPS' },
		{ from: 'postings', to: 'journal', label: 'SQL', line: 'dashed' },
		{ from: 'postings', to: 'cache' },
		{ from: 'console', to: 'journal' },
		{ from: 'postings', to: 'postings' }
	],
	boundaries: [{ id: 'box', label: 'Ledger', layout: { x: 0, y: 0, w: 1000, h: 500 } }]
};

describe('zoom in → new diagram', () => {
	const child = childDoc(parent, 'p1', 'postings', 'c4-component');

	it('makes the node the scope, with a ref back to it, named after it and of the kind below', () => {
		expect(child.diagram).toEqual({ name: 'Postings', kind: 'c4-component' });
		expect(child.boundaries).toEqual([{ id: SCOPE, label: 'Postings', layout: { x: 320, y: 100, w: 640, h: 420 }, ref: 'p1#postings' }]);
	});

	it('brings what it connects to, each with a ref: callers on the left, what it calls on the right', () => {
		const nodes = Object.fromEntries((child.nodes ?? []).map(n => [n.id, n]));
		expect(Object.keys(nodes)).toEqual(['console', 'journal', 'cache']);
		expect(nodes.console).toMatchObject({ name: 'Console', type: 'web-app', tags: ['web'], ref: refTo('p1', 'console') });
		expect(nodes.console.layout!.x).toBeLessThan(320);
		expect(nodes.journal.layout!.x).toBeGreaterThan(320 + 640);
		expect(nodes.cache.layout!.y).toBeGreaterThan(nodes.journal.layout!.y);
		// Only its own connections come; a loop on itself has no neighbour to show.
		expect(child.edges).toEqual([
			{ from: 'console', to: SCOPE, label: 'HTTPS' },
			{ from: SCOPE, to: 'journal', label: 'SQL', line: 'dashed' },
			{ from: SCOPE, to: 'cache' }
		]);
	});

	it('keeps only the tags its neighbours use', () => {
		expect(Object.keys(child.tags ?? {})).toEqual(['web', 'data']);
		expect(childDoc(parent, 'p1', 'alone', 'c4-component')).toMatchObject({ nodes: [], edges: [] });
		expect(childDoc(parent, 'p1', 'alone', 'c4-component').tags).toBeUndefined();
	});

	it('refuses a node that is not there', () => {
		expect(() => childDoc(parent, 'p1', 'ghost', 'c4-component')).toThrow(/no node ghost/);
	});
});

describe('a new diagram above a node', () => {
	const up = parentDoc(parent, 'p1', 'postings', 'c4-context');

	it('is of the kind above, named after the node, which zooms back down here', () => {
		expect(up.diagram).toEqual({ name: 'Postings', kind: 'c4-context' });
		expect(up.nodes![0]).toMatchObject({ id: 'postings', name: 'Postings', subtitle: 'Kotlin', links: [{ diagram: 'p1' }], ref: refTo('p1', 'postings') });
		expect(up.boundaries).toBeUndefined();
	});

	it('brings its neighbours where they sit around it, with refs, and their connections to it only', () => {
		const at = Object.fromEntries(up.nodes!.map(n => [n.id, n.layout!]));
		expect(Object.keys(at)).toEqual(['postings', 'console', 'journal', 'cache']);
		// Console was 300 left of Postings, Journal 300 right, Cache 300 right and 300 down: still so.
		expect([at.console.x - at.postings.x, at.journal.x - at.postings.x, at.cache.y - at.postings.y]).toEqual([-300, 300, 300]);
		expect(up.nodes!.slice(1).every(n => n.ref === refTo('p1', n.id) && !n.links)).toBe(true);
		expect(up.edges).toEqual([
			{ from: 'console', to: 'postings', label: 'HTTPS' },
			{ from: 'postings', to: 'journal', label: 'SQL', line: 'dashed' },
			{ from: 'postings', to: 'cache' }
		]);
	});
});
