<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A panel that slides up from the bottom on narrow screens (and opens in the middle on wide ones). A native modal <dialog>, so it keeps focus inside,
	 * closes on Escape, and the page behind it can't be scrolled or tapped; a tap on the backdrop closes it too.
	 */
	let { open, title, onclose, children }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

	let dialog = $state<HTMLDialogElement>();
	// A backdrop tap closes the sheet only if the press began on the backdrop too. The tap that opened the sheet
	// (on a node, say) ends with a click the browser sends afterwards, which would otherwise land on the brand-new
	// backdrop and close it at once.
	let pressedBackdrop = false;
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-label={title}
	onclose={() => {
		// Only a close the person made (Escape, the backdrop, ×) is reported. When the page closes this sheet to open
		// another, reporting it would close the new one too.
		if (open) onclose();
	}}
	onpointerdown={e => (pressedBackdrop = e.target === dialog)}
	onclick={e => {
		// The dialog element itself is only hit on the backdrop; the content sits in .body.
		if (e.target === dialog && pressedBackdrop) onclose();
		pressedBackdrop = false;
	}}
>
	<div class="body">
		<header>
			<h2>{title}</h2>
			<button type="button" class="close" aria-label="Close {title}" onclick={onclose}>×</button>
		</header>
		<div class="content">{@render children()}</div>
	</div>
</dialog>

<style>
	.sheet {
		margin: auto 0 0;
		width: 100%;
		max-width: 100%;
		max-height: 75vh;
		max-height: 75dvh;
		padding: 0;
		border: none;
		border-radius: 16px 16px 0 0;
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-lg, 0 -8px 32px rgba(0, 0, 0, 0.4));
	}
	.sheet[open] {
		animation: up 0.18s ease-out;
	}
	/* On a wide screen it is a dialog in the middle rather than a sheet along the bottom. */
	@media (min-width: 901px) {
		.sheet {
			margin: auto;
			width: min(540px, calc(100% - 32px));
			border-radius: 16px;
		}
	}
	.sheet::backdrop {
		background: rgba(8, 9, 16, 0.55);
	}
	@keyframes up {
		from {
			transform: translateY(24px);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet[open] {
			animation: none;
		}
	}
	.body {
		display: flex;
		flex-direction: column;
		max-height: 75vh;
		max-height: 75dvh;
	}
	header {
		display: flex;
		align-items: center;
		padding: 12px 8px 6px 16px;
		border-bottom: 1px solid var(--color-divider);
		flex: none;
	}
	h2 {
		flex: 1;
		margin: 0;
		font-family: var(--font-heading);
		font-size: 15px;
		font-weight: 500;
	}
	.close {
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 10px;
		background: transparent;
		color: var(--color-neutral-400);
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}
	.close:hover {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.content {
		overflow-y: auto;
		padding-bottom: env(safe-area-inset-bottom);
	}
	/* The side panels drop their desktop width and border when they sit in a sheet. */
	.content :global(.panel) {
		width: auto;
		border: none;
	}
	.content :global(.inspector) {
		border-bottom: none;
	}
</style>
