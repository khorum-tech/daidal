<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<main class="error">
	<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
	<p>{page.status === 404 ? "This diagram doesn't exist, or you can't see it." : (page.error?.message ?? 'Try reloading the page.')}</p>
	<p><a href={resolve('/')}>Back to your diagrams</a></p>
</main>

<style>
	.error {
		max-width: 460px;
		margin: 80px auto;
		padding: 0 16px;
	}
	h1 {
		font-family: var(--font-heading);
		font-size: 20px;
		font-weight: 500;
	}
	p {
		color: var(--color-neutral-500);
		font-size: 13.5px;
		line-height: 1.6;
	}
</style>
