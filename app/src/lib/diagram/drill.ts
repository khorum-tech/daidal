// "Zoom in → New diagram" (docs/superpowers/specs/2026-11-05-skope-kinds-c4-and-repo-aware-ai.md): the level below a
// node, made from the diagram it sits in. The node becomes the new diagram's scope, a container with a ref back to
// it; what it connects to comes along outside that container, each with a ref to its own node, so the new diagram
// starts with the same neighbours and connections the level above shows.
import type { DocEdge, DocNode, SkopeDoc } from '../types';
import { kindOf, type KindId } from './kinds';
import { NODE_H, NODE_W } from './model';

/** The scope container's id in a child diagram. */
export const SCOPE = 'scope';

const SCOPE_BOX = { x: 320, y: 100, w: 640, h: 420 };
const GAP = 40;

/** A ref to [nodeId] in diagram [diagramId]. */
export const refTo = (diagramId: string, nodeId: string) => `${diagramId}#${nodeId}`;

/** Each node [nodeId] connects to, once: "in" when it first appears as a caller, "out" when as a callee. */
function neighbours(edges: DocEdge[], nodeId: string, known: Set<string>): Map<string, 'in' | 'out'> {
	const side = new Map<string, 'in' | 'out'>();
	for (const e of edges) {
		const other = e.from === nodeId ? e.to : e.from;
		if (known.has(other) && !side.has(other)) side.set(other, e.from === nodeId ? 'out' : 'in');
	}
	return side;
}

/** [n] as a neighbour in the child: what it is, where it sits ([row] down its side), and a ref to it above. */
function neighbour(n: DocNode, where: 'in' | 'out', row: number, parentId: string): DocNode {
	const x = where === 'in' ? SCOPE_BOX.x - GAP * 2 - NODE_W : SCOPE_BOX.x + SCOPE_BOX.w + GAP * 2;
	return {
		id: n.id,
		name: n.name,
		type: n.type,
		...(n.subtitle ? { subtitle: n.subtitle } : {}),
		...(n.icon ? { icon: n.icon } : {}),
		...(n.tags?.length ? { tags: n.tags } : {}),
		layout: { x, y: SCOPE_BOX.y + row * (NODE_H + GAP) },
		ref: refTo(parentId, n.id)
	};
}

/** [e] redrawn in the child: its end at [nodeId] lands on the scope container instead. */
const toScope = (e: DocEdge, nodeId: string): DocEdge => ({
	from: e.from === nodeId ? SCOPE : e.from,
	to: e.to === nodeId ? SCOPE : e.to,
	...(e.label ? { label: e.label } : {}),
	...(e.line ? { line: e.line } : {}),
	...(e.direction ? { direction: e.direction } : {})
});

/**
 * The diagram one level below [nodeId] in [parent] (whose id is [parentId]), of kind [kind]: [nodeId] as a scope
 * container, and every node it connects to placed outside it, those it hears from on the left and those it calls on
 * the right, joined to the scope as they are joined to the node above.
 */
export function childDoc(parent: SkopeDoc, parentId: string, nodeId: string, kind: KindId): SkopeDoc {
	const byId = new Map((parent.nodes ?? []).map(n => [n.id, n]));
	const node = byId.get(nodeId);
	if (!node) throw new Error(`no node ${nodeId}`);
	// Its own connections only: a loop on itself has no neighbour to show.
	const touching = (parent.edges ?? []).filter(e => (e.from === nodeId) !== (e.to === nodeId));
	const side = neighbours(touching, nodeId, new Set(byId.keys()));
	const rows = { in: 0, out: 0 };
	const placed = [...side].map(([id, where]) => neighbour(byId.get(id)!, where, rows[where]++, parentId));
	const edges = touching.filter(e => side.has(e.from === nodeId ? e.to : e.from)).map(e => toScope(e, nodeId));
	const usedTags = new Set(placed.flatMap(n => n.tags ?? []));
	const tags = Object.fromEntries(Object.entries(parent.tags ?? {}).filter(([k]) => usedTags.has(k)));
	return {
		version: 1,
		diagram: { name: node.name, kind: kindOf(kind).id },
		...(Object.keys(tags).length ? { tags } : {}),
		nodes: placed,
		edges,
		boundaries: [{ id: SCOPE, label: node.name, layout: { ...SCOPE_BOX }, ref: refTo(parentId, nodeId) }]
	};
}
