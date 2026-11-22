<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
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
		crumbs?: Crumb[];
	} = $props();
	type Crumb = {
		label: string;
		href?: string;
		onclick?: () => void;
		title?: string;
		links?: { above: number; below: number };
		kind?: { label: string; level?: number; hint: string };
	};
	// The nearest crumb above where you are: the one step back when the bar has room for nothing more.
	const up = $derived(crumbs.slice(0, -1).findLast(c => c.href));
	// How much the bar gives up to fit the width it has, a step at a time, so nothing is ever cut off: 0 shows it all;
	// 1 drops your name (the initial stays); 2 shows the diagram's C4 level by its pips alone; 3 folds the levels between
	// the workspace and the one just above into a menu; 4 keeps only the step up and where you are.
	let fit = $state(0);
	const FULLEST = 4;
	let barEl = $state<HTMLElement>();
	let navEl = $state<HTMLElement>();
	const folded = $derived(crumbs.length > 3 ? crumbs.slice(1, -2) : []);
	let refitting = false;
	async function refit() {
		if (refitting) return;
		refitting = true;
		try {
			for (let step = 0; step <= FULLEST; step++) {
				fit = step;
				await tick();
				if (!navEl || navEl.scrollWidth <= navEl.clientWidth + 1) break;
			}
		} finally {
			refitting = false;
		}
	}
	// What decides the bar's width: refit when it changes, and once the fonts are in.
	const crumbKey = $derived(crumbs.map(c => `${c.label}|${c.kind?.label ?? ''}|${c.links?.above ?? ''}${c.links?.below ?? ''}`).join('/'));
	$effect(() => {
		void crumbKey;
		void refit();
	});
	$effect(() => {
		void document.fonts?.ready.then(() => refit());
	});
	$effect(() => {
		if (!barEl) return;
		let width = barEl.clientWidth;
		const ro = new ResizeObserver(() => {
			if (barEl && barEl.clientWidth !== width) {
				width = barEl.clientWidth;
				void refit();
			}
		});
		ro.observe(barEl);
		return () => ro.disconnect();
	});
	// The folded levels open as a list under their button. It sits outside the breadcrumb, which clips what overflows.
	let moreOpen = $state(false);
	let moreEl = $state<HTMLElement>();
	let morePos = $state({ top: 0, left: 0 });
	function toggleMore() {
		if (!moreOpen && moreEl) {
			const r = moreEl.getBoundingClientRect();
			morePos = { top: r.bottom + 6, left: Math.max(8, r.left) };
		}
		moreOpen = !moreOpen;
	}
	$effect(() => {
		if (!moreOpen) return;
		const away = (e: PointerEvent) => {
			const t = e.target as HTMLElement;
			if (!t.closest('.more-menu') && !moreEl?.contains(t)) moreOpen = false;
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') moreOpen = false;
		};
		document.addEventListener('pointerdown', away);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', away);
			document.removeEventListener('keydown', esc);
		};
	});
	afterNavigate(() => (moreOpen = false));
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

<header class="bar" bind:this={barEl}>
	<a class="brand" href={homeHref}>
		<span class="mark"><Logo size={22} /></span>
		<span>Daidal</span>
	</a>
	{#if crumbs.length}
		<span class="sep" aria-hidden="true"></span>
		{#if fit >= 4 && up}
			<!-- Room for one step back and where you are: the arrow goes up a level (from a C4 Component to its Container,
			     say), and the diagram's menu holds the rest. -->
			<nav aria-label="Breadcrumb" class="crumbs compact tight" bind:this={navEl}>
				<a class="up" href={up.href} aria-label="Up to {up.label}" title="Up to {up.label}" data-testid="crumb-up">
					<Icon name="caretLeft" size={16} />
					{#if up.kind?.level}{@render pips(up.kind.level)}{/if}
				</a>
				{@render crumb(crumbs[crumbs.length - 1])}
			</nav>
		{:else}
			<nav aria-label="Breadcrumb" class="crumbs" class:tight={fit >= 2} bind:this={navEl}>
				{#each crumbs as c, i (i)}
					{#if fit >= 3 && folded.length && i >= 1 && i <= folded.length}
						{#if i === 1}
							<span aria-hidden="true" class="slash">/</span>
							<button
								type="button"
								class="more"
								bind:this={moreEl}
								aria-haspopup="menu"
								aria-expanded={moreOpen}
								aria-label="Show {folded.length} more {folded.length === 1 ? 'level' : 'levels'}"
								title={folded.map(f => f.label).join(' / ')}
								data-testid="crumb-more"
								onclick={toggleMore}><Icon name="dots" size={16} /></button
							>
						{/if}
					{:else}
						{#if i > 0}<span aria-hidden="true" class="slash">/</span>{/if}
						{@render crumb(c)}
					{/if}
				{/each}
			</nav>
		{/if}
		{#if moreOpen && fit >= 3 && folded.length}
			<div class="more-menu" role="menu" aria-label="More levels" style:top="{morePos.top}px" style:left="{morePos.left}px">
				{#each folded as f (f.href ?? f.label)}
					<a role="menuitem" href={f.href}>
						{#if f.kind?.level}{@render pips(f.kind.level)}{/if}
						<span>{f.label}</span>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
	<div class="user" class:initial={fit >= 1} bind:this={userEl}>
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

{#snippet pips(level: number)}
	<span class="pips" aria-hidden="true">
		{#each [1, 2, 3, 4] as l (l)}<i class:on={l === level}></i>{/each}
	</span>
{/snippet}

{#snippet crumb(c: Crumb)}
	{#if c.kind}
		<span class="kind" class:named={!c.href} title="{c.kind.label} · {c.kind.hint}" data-testid="kind-badge" data-level={c.kind.level}>
			{#if c.kind.level}{@render pips(c.kind.level)}{/if}
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
	.who .name {
		white-space: nowrap;
	}
	.user.initial .name {
		display: none;
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
	/* A tight bar has no room for the kind's name: the pips say the level, and the diagram menu names the kind. */
	.tight .kind.named .pips + .kind-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.tight .kind.named {
		padding: 3px 5px;
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
	/* Until the bar is down to its last step the diagram's name keeps its width, so running out of room shows as
	   overflow and the bar gives up something else instead. */
	.crumbs:not(.compact) .crumb-btn {
		flex: none;
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
	/* The tightest bar: one step up and where you are. */
	.crumbs.compact {
		flex: 1 1 auto;
		gap: 2px;
	}
	.compact .crumb-btn {
		flex: 0 1 auto;
	}
	.up,
	.more {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		flex: none;
		min-width: 32px;
		height: 32px;
		padding: 0 6px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.up {
		margin-left: -8px;
	}
	.up:hover,
	.up:active,
	.more:hover,
	.more[aria-expanded='true'] {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
		color: var(--color-text);
	}
	.more-menu {
		position: fixed;
		z-index: 40;
		min-width: 200px;
		max-width: calc(100vw - 16px);
		padding: 6px;
		border-radius: 10px;
		background: var(--color-surface);
		border: 1px solid var(--color-divider);
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
	}
	.more-menu a {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 10px;
		border-radius: 7px;
		font-size: 14px;
		color: var(--color-text);
		text-decoration: none;
		white-space: nowrap;
	}
	.more-menu a span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.more-menu a:hover {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	/* A finger, on a tablet as on a phone: every way in the bar is big enough to tap. */
	@media (pointer: coarse) {
		.crumbs a,
		.crumb-btn {
			display: inline-flex;
			align-items: center;
			min-height: 40px;
		}
		.up,
		.more {
			min-width: 40px;
			height: 40px;
		}
	}
	/* A phone keeps them as big when the pointer reports fine (a stylus, a desktop emulating one). */
	@media (max-width: 600px) {
		.crumb-btn {
			min-height: 40px;
		}
		.up,
		.more {
			min-width: 40px;
			height: 40px;
		}
	}
</style>
