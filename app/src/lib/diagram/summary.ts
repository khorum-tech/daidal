import type { CardSummary, SkopeDoc } from '../types';
import { toScene } from './model';

const MAX_NAMES = 300;
const MAX_NAME = 100;
const MAX_BOXES = 400;

/**
 * What a card shows of a diagram without its document: its kind, counts, the first five tag colours, node names
 * (what search looks through) and the boxes its thumbnail draws, laid out by the canvas's own rules. The Worker
 * works it out on every save (worker/src/summary.ts).
 */
export function cardSummary(doc: SkopeDoc): CardSummary {
	const scene = toScene(doc);
	const box = (b: { x: number; y: number; w: number; h: number }) => [b.x, b.y, b.w, b.h].map(Math.round);
	return {
		kind: scene.kind,
		nodes: scene.nodes.length,
		edges: scene.edges.length,
		tags: scene.tags.slice(0, 5).map(t => t.color),
		names: scene.nodes
			.map(n => n.name.trim().slice(0, MAX_NAME))
			.filter(Boolean)
			.slice(0, MAX_NAMES),
		boxes: scene.nodes.slice(0, MAX_BOXES).map(box),
		frames: scene.boundaries.slice(0, MAX_BOXES).map(box)
	};
}
