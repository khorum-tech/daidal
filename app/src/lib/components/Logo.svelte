<script lang="ts">
	/**
	 * The Daidal mark: a cube whose edges trace a path between two nodes. Drawn in the current text colour, so it
	 * follows the theme wherever it sits (the header gives it the accent). The favicon (static/favicon.svg) is the
	 * same drawing with heavier lines, for 16 px.
	 */
	let { size = 20, label }: { size?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 256 256"
	fill="none"
	stroke="currentColor"
	stroke-width="14"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	style="flex:none"
>
	<path d="M128 20 221.5 74V182L128 236 34.5 182V74Z" />
	<path d="M34.5 74 158 145.3 128 162.6V236" />
	<path d="M221.5 74 176.5 100 128 72" />
	<circle cx="128" cy="72" r="17" fill="currentColor" stroke="none" />
	<circle cx="158" cy="145.3" r="17" fill="currentColor" stroke="none" />
</svg>
