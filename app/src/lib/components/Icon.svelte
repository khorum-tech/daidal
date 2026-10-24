<script lang="ts">
	import { ICON_PATHS } from '../diagram/icons';

	/** A Phosphor icon by name (see diagram/icons.ts); an unknown name draws the cube, as the prototype does. */
	let { name, size = 16, label }: { name: string; size?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 256 256"
	fill="currentColor"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	style="flex:none"
>
	<path d={ICON_PATHS[name] ?? ICON_PATHS.cube} />
</svg>
