<script lang="ts">
	import '#lib/styles/nocturne.css';
	import '#lib/styles/app.css';

	let { children } = $props();
</script>

<div class="app">
	{@render children()}
</div>
