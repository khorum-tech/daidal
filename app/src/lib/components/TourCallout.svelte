<script lang="ts">
	import type { TourStep } from '../tour';

	/**
	 * One step of the getting-started tour: a card beside the control it's about, which gets a ring round it. It
	 * never blocks the page, and never sits on the side panel the control is in, so the step is done on the real
	 * controls. On a phone the card sits above the bottom bar.
	 * The target is found again every so often, since panels open and close as the person works.
	 */
	let {
		step,
		index,
		total,
		narrow = false,
		onnext,
		onback,
		onend
	}: {
		step: TourStep;
		index: number;
		total: number;
		narrow?: boolean;
		onnext: () => void;
		onback: () => void;
		onend: () => void;
	} = $props();

	let rect = $state<DOMRect | null>(null);
	/** The side panel the target sits in, if any: the card goes beside it, so it never covers the panel. */
	let panel = $state<DOMRect | null>(null);
	let card = $state<HTMLElement>();
	let size = $state({ w: 0, h: 0, vw: 0, vh: 0 });

	function measure() {
		let found: DOMRect | null = null;
		let side: DOMRect | null = null;
		for (const selector of step.targets) {
			for (const el of document.querySelectorAll(selector)) {
				const r = el.getBoundingClientRect();
				if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight) {
					found = r;
					side = el.closest('aside')?.getBoundingClientRect() ?? null;
					break;
				}
			}
			if (found) break;
		}
		rect = found;
		panel = side;
		size = { w: card?.offsetWidth ?? 0, h: card?.offsetHeight ?? 0, vw: innerWidth, vh: innerHeight };
	}

	$effect(() => {
		void step;
		measure();
		const timer = setInterval(measure, 300);
		addEventListener('resize', measure);
		addEventListener('scroll', measure, true);
		return () => {
			clearInterval(timer);
			removeEventListener('resize', measure);
			removeEventListener('scroll', measure, true);
		};
	});

	const GAP = 12;
	/**
	 * Where the card goes on a wide screen: beside the side panel the target is in (on the canvas side, level with
	 * the target), else under the target if it fits, else over it; low on the right without a target.
	 */
	const place = $derived.by(() => {
		if (narrow) return null;
		const { w, h, vw, vh } = size;
		if (!rect) return { left: Math.max(16, vw - w - 24), top: Math.max(16, vh - h - 24) };
		const top = Math.min(Math.max(16, rect.top + rect.height / 2 - h / 2), Math.max(16, vh - h - 16));
		if (panel && panel.right + GAP + w <= vw - 16 && panel.left + panel.width / 2 < vw / 2) return { left: panel.right + GAP, top };
		if (panel && panel.left - GAP - w >= 16) return { left: panel.left - GAP - w, top };
		const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), Math.max(16, vw - w - 16));
		const below = rect.bottom + GAP;
		return { left, top: below + h <= vh - 16 ? below : Math.max(16, rect.top - GAP - h) };
	});

	/** The step's text, with its **bold** bits. */
	const parts = $derived((narrow && step.phoneBody ? step.phoneBody : step.body).split(/\*\*(.+?)\*\*/g));
</script>

{#if rect}
	<div class="ring" aria-hidden="true" style:left="{rect.left - 4}px" style:top="{rect.top - 4}px" style:width="{rect.width + 8}px" style:height="{rect.height + 8}px"></div>
{/if}
<div
	bind:this={card}
	class="tour"
	class:narrow
	role="dialog"
	aria-modal="false"
	aria-labelledby="tour-title"
	style:left={place ? `${place.left}px` : undefined}
	style:top={place ? `${place.top}px` : undefined}
>
	<p class="count">Tour · {index + 1} of {total}</p>
	<h2 id="tour-title">{step.title}</h2>
	<p class="body">
		{#each parts as part, i (i)}{#if i % 2}<strong>{part}</strong>{:else}{part}{/if}{/each}
	</p>
	<div class="row">
		<button type="button" class="btn btn-ghost" onclick={onend}>{index === total - 1 ? 'Close' : 'End tour'}</button>
		<span class="grow"></span>
		{#if index > 0}<button type="button" class="btn btn-secondary" onclick={onback}>Back</button>{/if}
		{#if index < total - 1}
			<button type="button" class="btn btn-primary" onclick={onnext}>{step.done ? 'Skip' : 'Next'}</button>
		{:else}
			<button type="button" class="btn btn-primary" onclick={onend}>Finish</button>
		{/if}
	</div>
</div>

<style>
	.ring {
		position: fixed;
		z-index: 90;
		border-radius: 10px;
		box-shadow:
			0 0 0 2px var(--color-accent),
			0 0 0 6px color-mix(in srgb, var(--color-accent) 25%, transparent);
		pointer-events: none;
		transition:
			left 0.15s,
			top 0.15s,
			width 0.15s,
			height 0.15s;
	}
	.tour {
		position: fixed;
		z-index: 91;
		width: 320px;
		box-sizing: border-box;
		padding: 14px 16px 12px;
		border-radius: 12px;
		border: 1px solid var(--color-accent-700);
		background: var(--color-surface-raised, #262839);
		color: var(--color-text);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
	}
	.tour.narrow {
		left: 12px;
		right: 12px;
		bottom: calc(76px + env(safe-area-inset-bottom));
		width: auto;
	}
	.count {
		margin: 0 0 4px;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	h2 {
		margin: 0 0 6px;
		font-size: 15px;
		font-weight: 600;
	}
	.body {
		margin: 0 0 12px;
		font-size: 13px;
		line-height: 1.55;
		color: var(--color-neutral-300);
	}
	.body strong {
		color: var(--color-text);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.grow {
		flex: 1;
	}
	.btn {
		font-size: 12.5px;
	}
</style>
