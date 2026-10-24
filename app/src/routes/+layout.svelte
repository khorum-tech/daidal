<script lang="ts">
	import '#lib/styles/nocturne.css';
	import '#lib/styles/app.css';

	let { children } = $props();
</script>

<svelte:head><title>Skope</title></svelte:head>

<div class="app">
	{@render children()}
</div>
