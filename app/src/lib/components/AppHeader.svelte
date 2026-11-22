<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { createApi } from '../api';
	import { download } from '../download';
	import { appearance } from '../appearance.svelte';
	import { buildLabel, buildTitle, type BuildInfo } from '../build';
	import type { Me } from '../types';
	import type { Workspace } from '../types';
	import AccessTokens from './AccessTokens.svelte';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import ProfileSheet from './ProfileSheet.svelte';
	import { startTour } from '../tour';
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
		/** The path to this page. The last can open a menu, with [links]: the diagrams above and below it by zooming. */
		/** A diagram's crumb can carry its [kind]: a C4 level shows as four pips with its own lit, and the last crumb names it. */
		crumbs?: {
			label: string;
			href?: string;
			onclick?: () => void;
			title?: string;
			links?: { above: number; below: number };
			kind?: { label: string; level?: number; hint: string };
		}[];
	} = $props();
	// What build is live (/version.json, loaded with the page): the account menu names it, a snapshot with its branch
	// off main and the release on prod.
	const build = $derived((page.data.build as BuildInfo | null | undefined) ?? null);
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
	let tab = $state<'profile' | 'appearance' | 'ai'>('profile');
	const api = createApi(fetch);

	function openSettings(which: 'profile' | 'appearance' | 'ai') {
		open = false;
		tab = which;
		settingsOpen = true;
	}
	/** Starts the getting-started tour on a new practice diagram in your personal workspace. */
	async function tutorial() {
		open = false;
		const id = await startTour(api, `personal:${me.email}`);
		await goto(`${resolve('/d/[id]', { id })}?tour=1`, { invalidateAll: true });
	}
	async function saveProfile(profile: { name: string; title: string }) {
		await api.updateMe(profile);
		await invalidateAll();
	}
	async function downloadData() {
		const data = await api.exportAccount();
		download(`daidal-account-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
	}
	async function deleteAccount(confirm: string) {
		await api.deleteAccount(confirm);
		// Signed out of Access too, so this browser doesn't quietly start a new, empty account.
		location.href = '/cdn-cgi/access/logout';
	}
</script>

<header class="bar">
	<a class="brand" href={homeHref}>
		<span class="mark"><Logo size={22} /></span>
		<span>Daidal</span>
	</a>
	{#if crumbs.length}
		<span class="sep" aria-hidden="true"></span>
		<nav aria-label="Breadcrumb" class="crumbs">
			{#each crumbs as c, i (i)}
				{#if i > 0}<span aria-hidden="true" class="slash">/</span>{/if}
				{#if c.kind}
					<span class="kind" class:named={!c.href} title="{c.kind.label} · {c.kind.hint}" data-testid="kind-badge" data-level={c.kind.level}>
						{#if c.kind.level}
							<span class="pips" aria-hidden="true">
								{#each [1, 2, 3, 4] as l (l)}<i class:on={l === c.kind.level}></i>{/each}
							</span>
						{/if}
						<span class="kind-label" class:sr={!!c.href}>{c.kind.label}</span>
					</span>
				{/if}
				{#if c.href}<a href={c.href}>{c.label}</a>{:else if c.onclick}
					<button
						type="button"
						class="crumb-btn"
						data-tour="diagram-menu"
						aria-current="page"
						aria-haspopup="dialog"
						title={c.title}
						aria-describedby={c.links && (c.links.above || c.links.below) ? 'crumb-links' : undefined}
						onclick={c.onclick}
					>
						<span>{c.label}</span>
						{#if c.links && (c.links.above || c.links.below)}
							<span id="crumb-links" hidden>Linked diagrams: {c.links.above} above, {c.links.below} below</span>
							<span class="links-badge" aria-hidden="true" data-testid="links-badge">
								<Icon name="treeStructure" size={11} />{#if c.links.above}<span>↑{c.links.above}</span>{/if}{#if c.links.below}<span>↓{c.links.below}</span>{/if}
							</span>
						{/if}
						<Icon name="caretDown" size={11} />
					</button>
				{:else}<span aria-current="page">{c.label}</span>{/if}
			{/each}
		</nav>
	{/if}
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

{#snippet ai()}
	<AccessTokens
		workspaces={(page.data.workspaces as Workspace[] | undefined) ?? []}
		list={() => api.tokens()}
		create={body => api.createToken(body)}
		revoke={id => api.revokeToken(id)}
	/>
{/snippet}

{#snippet accountItems()}
	<p class="email">{me.email}</p>
	{#if me.title}<p class="title">{me.title}</p>{/if}
	<button type="button" role="menuitem" onclick={() => openSettings('profile')}>Profile</button>
	<button type="button" role="menuitem" onclick={() => openSettings('appearance')}>Appearance</button>
	<button type="button" role="menuitem" onclick={() => openSettings('ai')}>AI access</button>
	<button type="button" role="menuitem" onclick={tutorial}>Tutorial</button>
	<a role="menuitem" href={resolve('/docs/[[page]]', {})}>Docs</a>
	<a role="menuitem" href="/cdn-cgi/access/logout">Sign out</a>
	{#if build}
		<!-- Text, not a menu item: a branch name can hold any word, and must never match another item's name. -->
		<p class="version" title={buildTitle(build)} data-testid="build-version">Version {buildLabel(build)}</p>
	{/if}
{/snippet}

<Sheet open={open && narrow} title="Account" onclose={() => (open = false)}>
	<div class="menu-sheet" role="menu">{@render accountItems()}</div>
</Sheet>

<Sheet open={settingsOpen} title="Profile and appearance" onclose={() => (settingsOpen = false)}>
	{#if settingsOpen}
		<ProfileSheet
			{me}
			settings={{ theme: appearance.theme, darkPalette: appearance.darkPalette, lightPalette: appearance.lightPalette, condition: appearance.condition, simulate: appearance.simulate, iconCards: appearance.iconCards }}
			light={appearance.light}
			onchange={change => appearance.set(change)}
			onsave={saveProfile}
			ondownload={downloadData}
			ondelete={deleteAccount}
			{ai}
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
	.user {
		position: relative;
		margin-left: auto;
	}
	.version {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
		.who .name {
			display: none;
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
	.version {
		margin: 4px 0 0;
		padding: 7px 10px 3px;
		border-top: 1px solid var(--color-divider);
		font-size: 11px;
		color: var(--color-neutral-500);
		overflow-wrap: anywhere;
		user-select: all;
	}
	.menu-sheet .version {
		padding: 10px 12px 4px;
		font-size: 12px;
	}
	.menu button:hover,
	.menu a:hover {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.links-badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		flex: none;
		padding: 1px 6px;
		border: 1px solid var(--color-divider);
		border-radius: 999px;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--color-neutral-400);
	}
	/* What kind of diagram a crumb is. A C4 level reads as four pips, the lit one its level, from Context (narrowest, top) down to Code. */
	.kind {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: none;
		color: var(--color-neutral-400);
		font-size: 11px;
	}
	.kind.named {
		padding: 2px 8px;
		border: 1px solid color-mix(in srgb, var(--color-accent) 45%, var(--color-divider));
		border-radius: 999px;
		color: var(--color-text);
	}
	.pips {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5px;
		width: 12px;
	}
	.pips i {
		height: 1.5px;
		border-radius: 1px;
		background: var(--color-neutral-600);
	}
	.pips i:nth-child(1) {
		width: 4px;
	}
	.pips i:nth-child(2) {
		width: 7px;
	}
	.pips i:nth-child(3) {
		width: 10px;
	}
	.pips i:nth-child(4) {
		width: 12px;
	}
	.pips i.on {
		height: 2.5px;
		background: var(--color-accent);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (max-width: 600px) {
		/* A phone's bar has no room for the name: the pips say the level, and the diagram menu names the kind. */
		.kind.named .pips + .kind-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		.kind.named {
			padding: 3px 5px;
		}
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
