<script lang="ts">
	import { bounds, isHidden, SHEET_H, SHEET_W, type Scene } from '../diagram/model';
	import { edgePath, type Box } from '../diagram/geometry';
	import NodeCard from './NodeCard.svelte';

	/**
	 * A diagram drawn read-only, the way the prototype's canvas draws it: containers, connections with their
	 * labels, then nodes. Switching tags off ghosts what they cover instead of hiding it.
	 */
	let {
		scene,
		on,
		selected = null,
		onselect,
		ghostOpacity = 0.22,
		edgeStyle = 'curved'
	}: {
		scene: Scene;
		on: Record<string, boolean>;
		selected?: string | null;
		onselect?: (id: string | null) => void;
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

	const tagByKey = $derived(Object.fromEntries(scene.tags.map(t => [t.key, t])));
	// Connections may end on a container as well as a node.
	const boxes = $derived.by(() => {
		const out = new Map<string, Box & { tags: string[] }>();
		for (const b of scene.boundaries) out.set(b.id, { ...b, tags: [] });
		for (const n of scene.nodes) out.set(n.id, n);
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

	// The drawing area: the prototype's sheet, grown to whatever spills past it.
	const box = $derived.by(() => {
		const b = bounds(scene);
		const x0 = Math.min(0, b.x) - PAD;
		const y0 = Math.min(0, b.y) - PAD;
		return { x0, y0, w: Math.max(SHEET_W, b.x + b.w) - x0 + PAD, h: Math.max(SHEET_H, b.y + b.h) - y0 + PAD };
	});

	let viewW = $state(0);
	let viewH = $state(0);
	let zoom = $state<number | null>(null); // null = fit to the view
	const fit = $derived(viewW && viewH ? Math.min(viewW / box.w, viewH / box.h, 1.5) : 1);
	const scale = $derived(zoom ?? fit);
	const step = (f: number) => (zoom = Math.max(0.25, Math.min(2.5, Math.round(scale * f * 100) / 100)));
</script>

<div class="canvas" bind:clientWidth={viewW} bind:clientHeight={viewH}>
	<div
		class="scroll"
		role="presentation"
		onclick={e => {
			if (e.target === e.currentTarget) onselect?.(null);
		}}
	>
		<div class="room" style:width="{box.w * scale}px" style:height="{box.h * scale}px">
			<div
				class="sheet"
				data-testid="diagram-sheet"
				style:width="{box.w}px"
				style:height="{box.h}px"
				style:transform="scale({scale}) translate({-box.x0}px, {-box.y0}px)"
			>
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

				{#each scene.nodes as n (n.id)}
					<NodeCard
						node={n}
						tags={tagByKey}
						ghosted={isHidden(n, on)}
						{ghostOpacity}
						selected={selected === n.id}
						onselect={id => onselect?.(selected === id ? null : id)}
					/>
				{/each}
			</div>
		</div>
	</div>

	<div class="zoom" role="group" aria-label="Zoom">
		<button type="button" onclick={() => step(1 / 1.2)} aria-label="Zoom out">−</button>
		<button type="button" class="pct" onclick={() => (zoom = null)} title="Fit to view">{Math.round(scale * 100)}%</button>
		<button type="button" onclick={() => step(1.2)} aria-label="Zoom in">+</button>
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
	}
	.scroll {
		position: absolute;
		inset: 0;
		overflow: auto;
	}
	.room {
		position: relative;
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
		min-width: 28px;
		height: 26px;
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
