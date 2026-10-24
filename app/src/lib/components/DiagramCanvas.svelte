<script lang="ts">
	import { bounds, isHidden, SHEET_H, SHEET_W, type Scene, type SceneNode } from '../diagram/model';
	import { edgePath, type Box } from '../diagram/geometry';
	import { clampView, fitView, panBy, zoomAt, type Point, type View } from '../diagram/zoom';
	import { SNAP_PX, snapBox, type Guide } from '../diagram/snap';
	import NodeCard from './NodeCard.svelte';

	/**
	 * A diagram drawn the way the prototype's canvas draws it: containers, connections with their labels, then
	 * nodes. Switching tags off ghosts what they cover instead of hiding it.
	 *
	 * The canvas handles every gesture itself, the same with a finger or a mouse: drag to pan, pinch or ctrl+scroll
	 * to zoom, scroll to pan. A tap (the browser's own click) selects a node, or clears the selection on empty space.
	 * With [editable] on, a mouse drags any node to move it; in [moving] mode a drag anywhere moves the selected
	 * node instead of panning, which is how a finger moves one. Moves snap to the nodes around and are reported
	 * through [onmove]. Enter on the selected node asks for its details ([ondetails]).
	 */
	let {
		scene,
		on,
		selected = null,
		onselect,
		editable = false,
		moving = false,
		onmove,
		ondetails,
		ghostOpacity = 0.22,
		edgeStyle = 'curved'
	}: {
		scene: Scene;
		on: Record<string, boolean>;
		selected?: string | null;
		onselect?: (id: string | null) => void;
		editable?: boolean;
		/** Drag anywhere moves the selected node (needs [editable] and a selection). */
		moving?: boolean;
		onmove?: (id: string, x: number, y: number) => void;
		ondetails?: (id: string) => void;
		ghostOpacity?: number;
		edgeStyle?: 'curved' | 'straight' | 'angled';
	} = $props();

	// Label placement around a container (web/index.html LP).
	const LP: Record<string, string> = {
		'inside-tl': 'left:8px;top:-6px',
		'inside-tr': 'right:8px;top:-6px',
		'inside-bl': 'left:8px;bottom:-6px',
		'inside-br': 'right:8px;bottom:-6px',
		'outside-tl': 'left:2px;top:-19px',
		'outside-tr': 'right:2px;top:-19px',
		'outside-bl': 'left:2px;bottom:-19px',
		'outside-br': 'right:2px;bottom:-19px'
	};
	const PAD = 48;
	/** How far a press may wander and still count as a tap. */
	const TAP_SLOP = 5;

	// A node being dragged is drawn at its new spot (and its connections follow) before the move is reported.
	let dragged = $state<{ id: string; x: number; y: number } | null>(null);
	let guides = $state<Guide[]>([]);
	const nodes = $derived<SceneNode[]>(scene.nodes.map(n => (dragged && n.id === dragged.id ? { ...n, x: dragged.x, y: dragged.y } : n)));

	const tagByKey = $derived(Object.fromEntries(scene.tags.map(t => [t.key, t])));
	// Connections may end on a container as well as a node.
	const boxes = $derived.by(() => {
		const out = new Map<string, Box & { tags: string[] }>();
		for (const b of scene.boundaries) out.set(b.id, { ...b, tags: [] });
		for (const n of nodes) out.set(n.id, n);
		return out;
	});
	const edges = $derived(
		scene.edges.flatMap(e => {
			const a = boxes.get(e.from);
			const b = boxes.get(e.to);
			if (!a || !b) return [];
			const off = isHidden(a, on) || isHidden(b, on);
			return [{ e, p: edgePath(e, a, b, edgeStyle), op: off ? ghostOpacity * 0.7 : 1 }];
		})
	);

	// The diagram itself with a margin: what "fit" fills the view with.
	const area = $derived.by(() => {
		const b = bounds(scene);
		return { x0: b.x - PAD, y0: b.y - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD };
	});

	let viewW = $state(0);
	let viewH = $state(0);
	let chosen = $state<View | null>(null); // null = fit, and keep fitting as the view resizes
	const view = $derived(chosen ?? fitView(area, viewW, viewH));
	const setView = (v: View) => (chosen = clampView(v, area, viewW, viewH));
	const zoomBy = (f: number, p: Point = { x: viewW / 2, y: viewH / 2 }) => setView(zoomAt(view, Math.round(view.s * f * 100) / 100, p));

	let canvas = $state<HTMLDivElement>();
	const local = (e: { clientX: number; clientY: number }): Point => {
		const r = canvas!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};

	// Wheel: ctrl+scroll (and a trackpad pinch, which arrives as one) zooms at the cursor; plain scrolling pans.
	// Registered by hand because Svelte's wheel handlers are passive, and the page must not scroll or zoom instead.
	$effect(() => {
		const el = canvas;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (e.ctrlKey) zoomBy(Math.exp(-Math.max(-40, Math.min(40, e.deltaY)) * 0.01), local(e));
			else setView(panBy(view, -e.deltaX, -e.deltaY));
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	// Pointer gestures. Every pointer on the canvas is tracked; one decides between a pan and a node drag, two pinch.
	type Gesture =
		| { kind: 'pan'; pointer: number; start: Point; last: Point; moved: boolean }
		| { kind: 'node'; pointer: number; start: Point; node: SceneNode; moved: boolean; touch: boolean }
		| { kind: 'pinch'; dist: number; mid: Point; from: View };
	const pointers = new Map<number, Point>();
	let gesture: Gesture | null = null;
	let panning = $state(false);
	// Whether the last press turned into a drag: the click the browser sends after it is then not a tap.
	let dragJustEnded = false;

	const spread = () => {
		const [a, b] = [...pointers.values()];
		return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
	};

	function down(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const target = e.target as Element;
		if (target.closest('.zoom')) return; // the zoom buttons are plain buttons
		dragJustEnded = false;
		const p = local(e);
		pointers.set(e.pointerId, p);
		if (pointers.size === 2) {
			// A second finger turns whatever the first was doing into a pinch; a half-dragged node goes back.
			dragged = null;
			const { dist, mid } = spread();
			gesture = { kind: 'pinch', dist, mid, from: view };
			return;
		}
		if (pointers.size > 2) return;
		const touch = e.pointerType !== 'mouse';
		// In moving mode the selected node follows a drag from anywhere; otherwise a mouse drags the node under it.
		const id = moving ? selected : touch ? null : (target.closest<HTMLElement>('[data-node]')?.dataset.node ?? null);
		const node = editable && id ? scene.nodes.find(n => n.id === id) : undefined;
		gesture = node
			? { kind: 'node', pointer: e.pointerId, start: p, node, moved: false, touch }
			: { kind: 'pan', pointer: e.pointerId, start: p, last: p, moved: false };
	}

	function move(e: PointerEvent) {
		if (!pointers.has(e.pointerId) || !gesture) return;
		const p = local(e);
		pointers.set(e.pointerId, p);
		if (gesture.kind === 'pinch') {
			if (pointers.size < 2) return;
			const { dist, mid } = spread();
			const zoomed = zoomAt(gesture.from, gesture.from.s * (dist / (gesture.dist || 1)), gesture.mid);
			setView(panBy(zoomed, mid.x - gesture.mid.x, mid.y - gesture.mid.y));
			return;
		}
		if (e.pointerId !== gesture.pointer) return;
		if (!gesture.moved && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) < TAP_SLOP) return;
		if (!gesture.moved && e.pointerType === 'mouse') {
			// A mouse drag may leave the canvas, so its pointer is captured, and only now: captured from the press, the
			// click that ends a plain tap would go to the canvas instead of the node. A touch stays with its element on
			// its own, and WebKit throws on capturing one ("The object can not be found here"), which stopped every
			// gesture there.
			try {
				canvas!.setPointerCapture(e.pointerId);
			} catch {
				// Then the drag ends at the canvas edge, which is fine.
			}
		}
		gesture.moved = true;
		if (gesture.kind === 'pan') {
			panning = true;
			setView(panBy(view, p.x - gesture.last.x, p.y - gesture.last.y));
			gesture.last = p;
		} else {
			const n = gesture.node;
			const box = { x: n.x + (p.x - gesture.start.x) / view.s, y: n.y + (p.y - gesture.start.y) / view.s, w: n.w, h: n.h };
			// Alt places a node freely, as in the prototype.
			const snapped = e.altKey
				? { x: box.x, y: box.y, guides: [] }
				: snapBox(box, scene.nodes.filter(o => o.id !== n.id), SNAP_PX[gesture.touch ? 'touch' : 'mouse'] / view.s);
			dragged = { id: n.id, x: snapped.x, y: snapped.y };
			guides = snapped.guides;
		}
	}

	function up(e: PointerEvent, cancelled = false) {
		if (!pointers.delete(e.pointerId)) return;
		const g = gesture;
		if (g?.kind === 'pinch') {
			// The pinch ends with the first finger lifted; the other can't start a drag until it lifts too.
			gesture = null;
			return;
		}
		if (!g || e.pointerId !== g.pointer) return;
		gesture = null;
		panning = false;
		guides = [];
		dragJustEnded = g.moved;
		const d = dragged;
		dragged = null;
		if (g.kind === 'node' && g.moved && d && !cancelled) onmove?.(d.id, Math.round(d.x), Math.round(d.y));
	}

	/** A tap on empty space clears the selection. Nodes handle their own taps (NodeCard). */
	function tapEmpty(e: MouseEvent) {
		if (dragJustEnded || (e.target as Element).closest('[data-node], .zoom')) return;
		onselect?.(null);
	}

	// The keyboard can do what the pointer does, once the canvas has focus.
	function keys(e: KeyboardEvent) {
		if (e.target !== canvas) return;
		const step = 60;
		const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
		if (moves[e.key]) setView(panBy(view, ...moves[e.key]));
		else if (e.key === '+' || e.key === '=') zoomBy(1.2);
		else if (e.key === '-') zoomBy(1 / 1.2);
		else if (e.key === '0') chosen = null;
		else return;
		e.preventDefault();
	}
</script>

<!-- A custom widget: it takes focus and answers the arrow keys, +, - and 0 as well as pointers (see keys()), which
     Svelte's role table doesn't credit to "application". -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="canvas"
	class:panning
	class:editable
	class:moving={moving && editable && !!selected}
	role="application"
	aria-label="Diagram canvas. Drag or use the arrow keys to move around; pinch, ctrl+scroll or plus and minus to zoom; 0 fits the diagram{editable ? '. Drag a node to move it' : ''}."
	tabindex="0"
	onclick={tapEmpty}
	bind:this={canvas}
	bind:clientWidth={viewW}
	bind:clientHeight={viewH}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={e => up(e)}
	onpointercancel={e => up(e, true)}
	onkeydown={keys}
>
	<div class="sheet" data-testid="diagram-sheet" style:transform="translate({view.tx}px, {view.ty}px) scale({view.s})">
		{#each scene.boundaries as b (b.id)}
			<div
				class="boundary"
				style:left="{b.x}px"
				style:top="{b.y}px"
				style:width="{b.w}px"
				style:height="{b.h}px"
				style:border="{b.bw}px {b.bs} var(--color-neutral-800)"
			>
				{#if b.label}<span class="b-label" style={LP[b.pos]}>{b.label}</span>{/if}
			</div>
		{/each}

		<svg class="edges" width={SHEET_W} height={SHEET_H} aria-hidden="true">
			<defs>
				{#each [['arrThin', 1.1, '#75798c'], ['arr', 1.4, '#75798c'], ['arrBold', 1.9, '#8c90a3']] as [id, w, c] (id)}
					<marker id={String(id)} viewBox="0 0 7 6" markerWidth="9" markerHeight="8" refX="5.9" refY="3" markerUnits="userSpaceOnUse" orient="auto">
						<path d="M0.6,0.5L5.9,3L0.6,5.5" fill="none" stroke={String(c)} stroke-width={Number(w)} stroke-linecap="round" stroke-linejoin="round" />
					</marker>
					<marker id={String(id).replace('arr', 'arrRev')} viewBox="0 0 7 6" markerWidth="9" markerHeight="8" refX="1.1" refY="3" markerUnits="userSpaceOnUse" orient="auto">
						<path d="M6.4,0.5L1.1,3L6.4,5.5" fill="none" stroke={String(c)} stroke-width={Number(w)} stroke-linecap="round" stroke-linejoin="round" />
					</marker>
				{/each}
			</defs>
			{#each guides as g, i (i)}
				<line class="guide" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} vector-effect="non-scaling-stroke" />
			{/each}
			{#each edges as { e, p, op } (e.key)}
				<path
					d={p.d}
					fill="none"
					stroke="#595d6c"
					stroke-width={e.width}
					stroke-linecap={p.cap}
					stroke-dasharray={p.dash || undefined}
					marker-end={p.markerEnd ? `url(#${p.markerEnd})` : undefined}
					marker-start={p.markerStart ? `url(#${p.markerStart})` : undefined}
					opacity={op}
					data-edge="{e.from}>{e.to}"
				/>
			{/each}
		</svg>

		{#each edges as { e, p, op } (e.key)}
			{#if e.showLabel && e.label}
				<span class="e-label" style:left="{p.lx}px" style:top="{p.ly}px" style:opacity={op}>{e.label}</span>
			{/if}
		{/each}

		{#each nodes as n (n.id)}
			<NodeCard
				node={n}
				tags={tagByKey}
				ghosted={isHidden(n, on)}
				{ghostOpacity}
				selected={selected === n.id}
				dragging={dragged?.id === n.id}
				onselect={id => {
					if (!dragJustEnded) onselect?.(id);
				}}
				ondetails={id => ondetails?.(id)}
			/>
		{/each}
	</div>

	<div class="zoom" role="group" aria-label="Zoom">
		<button type="button" onclick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">−</button>
		<button type="button" class="pct" onclick={() => (chosen = null)} title="Fit to view" aria-label="Fit to view, now {Math.round(view.s * 100)}%">{Math.round(view.s * 100)}%</button>
		<button type="button" onclick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
	</div>
</div>

<style>
	.canvas {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--color-bg);
		background-image: radial-gradient(color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px);
		background-size: 22px 22px;
		/* Every gesture is the canvas's own: the browser neither scrolls nor zooms the page from here. */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		cursor: grab;
		outline: none;
	}
	.canvas:focus-visible {
		box-shadow: inset 0 0 0 2px var(--color-accent);
	}
	.canvas.panning {
		cursor: grabbing;
	}
	.canvas.editable :global(.node:not(.dragging)) {
		cursor: move;
	}
	.canvas.moving {
		cursor: move;
	}
	.sheet {
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
	}
	.boundary {
		position: absolute;
		box-sizing: border-box;
		border-radius: 12px;
		pointer-events: none;
	}
	.b-label {
		position: absolute;
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		background: var(--color-bg);
		padding: 0 5px;
		white-space: nowrap;
	}
	.edges {
		position: absolute;
		left: 0;
		top: 0;
		overflow: visible;
		pointer-events: none;
	}
	.guide {
		stroke: var(--color-accent-2-300, var(--color-accent-300));
		stroke-width: 1;
		stroke-dasharray: 3 4;
	}
	.e-label {
		position: absolute;
		transform: translate(-50%, -50%);
		font-size: 10px;
		line-height: 1;
		white-space: nowrap;
		pointer-events: none;
		padding: 2px 4px;
		border-radius: 4px;
		background: var(--color-bg);
		color: var(--color-neutral-500);
	}
	.zoom {
		position: absolute;
		right: 14px;
		bottom: 14px;
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 9px;
		background: var(--color-surface);
		box-shadow: var(--shadow-md);
	}
	.zoom button {
		min-width: 32px;
		height: 30px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--color-neutral-400);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.zoom button:hover {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
		color: var(--color-text);
	}
	.zoom .pct {
		font-size: 11.5px;
		min-width: 44px;
	}
</style>
