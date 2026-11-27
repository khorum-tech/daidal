<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { SIGN_IN_ERRORS, startHref } from '#lib/signin.ts';

	let { data } = $props();
	const buttons = $derived(data.providers.filter(p => p.kind === 'redirect'));
	const outside = $derived(data.providers.find(p => p.kind === 'header'));
	const problem = $derived(data.error ? (SIGN_IN_ERRORS[data.error] ?? SIGN_IN_ERRORS.failed) : null);
</script>

<svelte:head><title>Sign in · Daidal</title></svelte:head>

<main class="signin">
	<div class="card">
		<h1><span class="mark"><Logo size={26} /></span> Sign in to Daidal</h1>

		{#if problem}
			<p class="problem" role="alert">{problem}</p>
		{:else if data.signedOut}
			<p class="note" role="status">You're signed out.</p>
		{/if}

		{#if buttons.length}
			<ul class="providers">
				{#each buttons as p (p.id)}
					<li>
						<a class="btn btn-secondary provider" href={startHref(p.id, data.returnTo)}>
							<Icon name={p.icon ?? 'key'} size={18} />
							<span>Continue with {p.name}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else if outside}
			<p class="note">This Daidal signs you in through {outside.name}.</p>
			<a class="btn btn-primary provider" href={data.returnTo.startsWith('/app') ? data.returnTo : '/app/'}>Sign in</a>
		{:else}
			<p class="note">No way of signing in is turned on here yet. Whoever runs this Daidal can turn one on (docs/sign-in.md).</p>
		{/if}
	</div>
</main>

<style>
	.signin {
		flex: 1;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		overflow-y: auto;
	}
	.card {
		width: 100%;
		max-width: 380px;
		padding: 28px 24px;
		border: 1px solid var(--color-divider);
		border-radius: 12px;
		background: var(--color-surface);
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 20px;
		font-family: var(--font-heading);
		font-size: 19px;
		font-weight: 500;
	}
	.mark {
		display: inline-flex;
		color: var(--color-accent);
	}
	.providers {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.provider {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		box-sizing: border-box;
		/* A finger-sized target on a phone or an iPad. */
		min-height: 44px;
		text-decoration: none;
		font-size: 14px;
	}
	.note,
	.problem {
		margin: 0 0 16px;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--color-neutral-500);
	}
	.problem {
		padding: 10px 12px;
		border-radius: 8px;
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-danger, #e5484d) 14%, transparent);
	}
</style>
