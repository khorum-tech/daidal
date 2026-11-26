<script lang="ts">
	/**
	 * The handle on a side panel's inner edge that resizes it: dragged with a mouse, a finger or a pen, moved with the
	 * arrow keys (Shift for bigger steps, Home and End for the smallest and largest), and put back to [min] by a double
	 * click or double tap. [side] is the side the panel is on, so a drag toward the canvas widens it. Each change is
	 * reported with [onresize] as it happens, and [onend] once the drag or key press is over, to save it.
	 */
	let {
		side,
		label,
		width,
		min,
		max,
		onresize,
		onend
	}: {
		side: 'left' | 'right';
		label: string;
		width: number;
		min: number;
		max: number;
		onresize: (width: number) => void;
		onend?: () => void;
	} = $props();

	const STEP = 16;
	const BIG_STEP = 64;
	const DOUBLE_TAP_MS = 400;
	const SLOP = 4;

	let drag: { pointer: number; x: number; start: number; moved: boolean } | null = null;
	let lastTap = 0;
	let dragging = $state(false);

	const clamp = (w: number) => Math.round(Math.min(Math.max(w, min), Math.max(min, max)));
	const grow = $derived(side === 'left' ? 1 : -1);

	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
		drag = { pointer: e.pointerId, x: e.clientX, start: width, moved: false };
		dragging = true;
	}

	function move(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointer) return;
		const dx = e.clientX - drag.x;
		if (!drag.moved && Math.abs(dx) < SLOP) return;
		drag.moved = true;
		const next = clamp(drag.start + dx * grow);
		if (next !== width) onresize(next);
	}

	function up(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointer) return;
		const { moved } = drag;
		drag = null;
		dragging = false;
		if (moved) {
			lastTap = 0;
			onend?.();
		} else if (e.type === 'pointerup') {
			// A second press that doesn't move, soon after the first, puts the panel back: a double click or double tap.
			if (lastTap && e.timeStamp - lastTap <= DOUBLE_TAP_MS) {
				lastTap = 0;
				reset();
			} else lastTap = e.timeStamp;
		}
	}

	function reset() {
		if (width !== min) onresize(min);
		onend?.();
	}

	function key(e: KeyboardEvent) {
		const step = e.shiftKey ? BIG_STEP : STEP;
		let next: number;
		if (e.key === 'ArrowRight') next = width + step * grow;
		else if (e.key === 'ArrowLeft') next = width - step * grow;
		else if (e.key === 'Home') next = min;
		else if (e.key === 'End') next = max;
		else return;
		e.preventDefault();
		next = clamp(next);
		if (next !== width) onresize(next);
		onend?.();
	}
</script>

<!-- A window splitter: a focusable separator whose value is the panel's width. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="resizer {side}"
	class:dragging
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	aria-valuenow={width}
	aria-valuemin={min}
	aria-valuemax={Math.max(min, max)}
	tabindex="0"
	title="Drag to resize · double-click to reset"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onkeydown={key}
></div>

<style>
	/* Takes no room in the row; its press area straddles the panel's border, mostly over the panel. */
	.resizer {
		position: relative;
		flex: none;
		width: 0;
		z-index: 4;
		touch-action: none;
		outline: none;
	}
	.resizer::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 12px;
		cursor: col-resize;
	}
	.resizer.left::before {
		left: -8px;
	}
	.resizer.right::before {
		right: -8px;
	}
	/* The line that shows on hover, while dragging and with keyboard focus. */
	.resizer::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: -1px;
		width: 3px;
		background: var(--color-accent);
		opacity: 0;
		transition: opacity 0.12s;
		pointer-events: none;
	}
	.resizer:hover::after,
	.resizer.dragging::after,
	.resizer:focus-visible::after {
		opacity: 1;
	}
	/* A finger needs a wider press area. */
	@media (pointer: coarse) {
		.resizer::before {
			width: 28px;
		}
		.resizer.left::before {
			left: -20px;
		}
		.resizer.right::before {
			right: -20px;
		}
	}
</style>
