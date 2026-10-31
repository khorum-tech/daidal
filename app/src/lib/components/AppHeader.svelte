<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { createApi } from '../api';
	import { appearance } from '../appearance.svelte';
	import type { Me } from '../types';
	import Icon from './Icon.svelte';
	import ProfileSheet from './ProfileSheet.svelte';
	import Sheet from './Sheet.svelte';

	/**
	 * The app's top bar: the mark, where you are, and who is signed in, with their profile and appearance settings.
	 * Sign-out goes through Cloudflare Access.
	 */
	let {
		me,
		homeHref,
		crumbs = []
	}: {
		me: Me;
		homeHref: string;
		/** Where you are. A crumb with [onclick] is a button (the diagram's name opens what can be done with it). */
		crumbs?: { label: string; href?: string; onclick?: () => void; title?: string }[];
	} = $props();
	let open = $state(false);
	let userEl = $state<HTMLElement>();
	// On a phone the account menu is a sheet from the bottom, like the app's other menus; on a wider screen a
	// dropdown, which a press anywhere else or Escape closes.
	let narrow = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(max-width: 600px)');
		narrow = mq.matches;
		const follow = (e: MediaQueryListEvent) => (narrow = e.matches);
		mq.addEventListener('change', follow);
		return () => mq.removeEventListener('change', follow);
	});
	$effect(() => {
		if (!open || narrow) return;
		const away = (e: PointerEvent) => {
			if (!userEl?.contains(e.target as Node)) open = false;
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		document.addEventListener('pointerdown', away);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', away);
			document.removeEventListener('keydown', esc);
		};
	});
	let settingsOpen = $state(false);
	let tab = $state<'profile' | 'appearance'>('profile');
	const api = createApi(fetch);

	function openSettings(which: 'profile' | 'appearance') {
		open = false;
		tab = which;
		settingsOpen = true;
	}
	async function saveProfile(profile: { name: string; title: string }) {
		await api.updateMe(profile);
		await invalidateAll();
	}
</script>

<header class="bar">
	<a class="brand" href={homeHref}>
		<span class="mark"><Icon name="logo" size={20} /></span>
		<span>Skope</span>
	</a>
	{#if crumbs.length}
		<span class="sep" aria-hidden="true"></span>
		<nav aria-label="Breadcrumb" class="crumbs">
			{#each crumbs as c, i (i)}
				{#if i > 0}<span aria-hidden="true" class="slash">/</span>{/if}
				{#if c.href}<a href={c.href}>{c.label}</a>{:else if c.onclick}
					<button type="button" class="crumb-btn" aria-current="page" aria-haspopup="dialog" title={c.title} onclick={c.onclick}>
						<span>{c.label}</span><Icon name="caretDown" size={11} />
					</button>
				{:else}<span aria-current="page">{c.label}</span>{/if}
			{/each}
		</nav>
	{/if}
	<span class="readonly tag tag-outline" title="Everything the prototype did is here; the old prototype stays at /prototype for now">Preview</span>
	<div class="user" bind:this={userEl}>
		<button type="button" class="who" aria-expanded={open} aria-haspopup={narrow ? 'dialog' : 'menu'} aria-label="Account: {me.name || me.email}" onclick={() => (open = !open)}>
			<span class="avatar" aria-hidden="true">{(me.name || me.email).slice(0, 1).toUpperCase()}</span>
			<span class="name">{me.name || me.email}</span>
		</button>
		{#if open && !narrow}
			<div class="menu" role="menu">{@render accountItems()}</div>
		{/if}
	</div>
</header>

{#snippet accountItems()}
	<p class="email">{me.email}</p>
	{#if me.title}<p class="title">{me.title}</p>{/if}
	<button type="button" role="menuitem" onclick={() => openSettings('profile')}>Profile</button>
	<button type="button" role="menuitem" onclick={() => openSettings('appearance')}>Appearance</button>
	<a role="menuitem" href="/prototype/">Open the prototype</a>
	<a role="menuitem" href="/cdn-cgi/access/logout">Sign out</a>
{/snippet}

<Sheet open={open && narrow} title="Account" onclose={() => (open = false)}>
	<div class="menu-sheet" role="menu">{@render accountItems()}</div>
</Sheet>

<Sheet open={settingsOpen} title="Profile and appearance" onclose={() => (settingsOpen = false)}>
	{#if settingsOpen}
		<ProfileSheet
			{me}
			settings={{ theme: appearance.theme, condition: appearance.condition, simulate: appearance.simulate, iconCards: appearance.iconCards }}
			light={appearance.light}
			onchange={change => appearance.set(change)}
			onsave={saveProfile}
			bind:tab
		/>
	{/if}
</Sheet>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 0 16px;
		height: 52px;
		flex: none;
		border-bottom: 1px solid var(--color-divider);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: 16px;
		color: var(--color-text);
		text-decoration: none;
	}
	.mark {
		color: var(--color-accent);
		display: flex;
	}
	.sep {
		width: 1px;
		height: 20px;
		background: var(--color-divider);
	}
	.crumbs {
		flex: 0 1 auto;
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
	}
	.crumbs a {
		color: var(--color-neutral-500);
		text-decoration: none;
	}
	.crumbs a:hover {
		color: var(--color-text);
	}
	.slash {
		color: var(--color-neutral-700);
	}
	.readonly {
		margin-left: auto;
		font-size: 10px;
		flex: none;
	}
	.user {
		position: relative;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 8px;
		font: inherit;
		font-size: 13px;
		padding: 4px 8px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
	}
	.who:hover {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 11px;
		background: var(--color-accent-700);
		color: var(--color-text);
	}
	@media (max-width: 600px) {
		.bar {
			gap: 10px;
			padding: 0 12px;
		}
		.brand > span:last-child,
		.readonly,
		.who .name {
			display: none;
		}
		/* The read-only tag usually pushes the user menu right; without it the menu does it itself. */
		.user {
			margin-left: auto;
		}
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 30;
		min-width: 220px;
		padding: 6px;
		border-radius: 10px;
		background: var(--color-surface);
		border: 1px solid var(--color-divider);
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
	}
	.email,
	.title {
		margin: 0;
		padding: 4px 10px;
		font-size: 12px;
		color: var(--color-neutral-500);
	}
	.title {
		padding-top: 0;
		color: var(--color-neutral-600);
	}
	.menu-sheet {
		display: flex;
		flex-direction: column;
		padding: 6px 8px 14px;
	}
	.menu-sheet a,
	.menu-sheet button {
		padding: 13px 12px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 16px;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.menu-sheet .email,
	.menu-sheet .title {
		font-size: 13px;
		padding: 4px 12px;
	}
	.menu a,
	.menu button {
		padding: 7px 10px;
		border: none;
		background: transparent;
		font: inherit;
		text-align: left;
		cursor: pointer;
		border-radius: 7px;
		font-size: 13px;
		color: var(--color-text);
		text-decoration: none;
	}
	.menu button:hover,
	.menu a:hover {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.crumb-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		max-width: 100%;
		padding: 4px 8px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
	}
	.crumb-btn span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.crumb-btn :global(svg) {
		flex: none;
		color: var(--color-neutral-500);
	}
	.crumb-btn:hover {
		background: color-mix(in srgb, var(--color-text) 7%, transparent);
	}
</style>
