<script lang="ts">
	import '#lib/styles/nocturne.css';
	import '#lib/styles/app.css';
	import { appearance } from '#lib/appearance.svelte.ts';
	import { CVD_MATRICES, filterMatrix } from '#lib/diagram/colour.ts';

	let { children } = $props();

	$effect(() => appearance.start());
	// The theme and the simulated condition sit on the root, so sheets (in the browser's top layer, outside the
	// app's box) follow them too.
	$effect(() => {
		const root = document.documentElement;
		root.dataset.theme = appearance.light ? 'light' : 'dark';
		if (appearance.simulating) root.dataset.cvd = appearance.simulating;
		else delete root.dataset.cvd;
	});
	const conditions = Object.keys(CVD_MATRICES) as (keyof typeof CVD_MATRICES)[];
</script>

<div class="app">
	{@render children()}
</div>

<!-- The colour-vision filters the root's data-cvd picks from (app.css). -->
<svg class="cvd-filters" aria-hidden="true" width="0" height="0">
	{#each conditions as c (c)}
		<filter id="cvd-{c}"><feColorMatrix type="matrix" values={filterMatrix(c)} /></filter>
	{/each}
</svg>
