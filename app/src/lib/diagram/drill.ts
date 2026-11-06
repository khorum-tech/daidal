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

/**
 * The diagram one level below [nodeId] in [parent] (whose id is [parentId]), of kind [kind]: [nodeId] as a scope
 * container, and every node it connects to placed outside it, those it hears from on the left and those it calls on
 * the right, joined to the scope as they are joined to the node above.
 */
export function childDoc(parent: SkopeDoc, parentId: string, nodeId: string, kind: KindId): SkopeDoc {
	const node = (parent.nodes ?? []).find(n => n.id === nodeId);
	if (!node) throw new Error(`no node ${nodeId}`);
	const touching = (parent.edges ?? []).filter(e => (e.from === nodeId) !== (e.to === nodeId));
	const byId = new Map((parent.nodes ?? []).map(n => [n.id, n]));
	const side = new Map<string, 'in' | 'out'>();
	for (const e of touching) {
		const other = e.from === nodeId ? e.to : e.from;
		if (byId.has(other) && !side.has(other)) side.set(other, e.from === nodeId ? 'out' : 'in');
	}
	const placed: DocNode[] = [];
	const count = { in: 0, out: 0 };
	for (const [id, where] of side) {
		const n = byId.get(id)!;
		const x = where === 'in' ? SCOPE_BOX.x - GAP * 2 - NODE_W : SCOPE_BOX.x + SCOPE_BOX.w + GAP * 2;
		const y = SCOPE_BOX.y + count[where]++ * (NODE_H + GAP);
		placed.push({
			id: n.id,
			name: n.name,
			type: n.type,
			...(n.subtitle ? { subtitle: n.subtitle } : {}),
			...(n.icon ? { icon: n.icon } : {}),
			...(n.tags?.length ? { tags: n.tags } : {}),
			layout: { x, y },
			ref: refTo(parentId, n.id)
		});
	}
	const edges: DocEdge[] = touching
		.filter(e => side.has(e.from === nodeId ? e.to : e.from))
		.map(e => ({
			from: e.from === nodeId ? SCOPE : e.from,
			to: e.to === nodeId ? SCOPE : e.to,
			...(e.label ? { label: e.label } : {}),
			...(e.line ? { line: e.line } : {}),
			...(e.direction ? { direction: e.direction } : {})
		}));
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
