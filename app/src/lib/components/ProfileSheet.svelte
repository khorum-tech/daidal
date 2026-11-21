<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DARK_PALETTES, LIGHT_PALETTES, type Palette, type Settings } from '../appearance.svelte';
	import { CONDITIONS, distinguishable, simColor } from '../diagram/colour';
	import { PALETTES } from '@khorum/daidal-core/edit';
	import type { Me } from '../types';

	/**
	 * The prototype's profile and appearance settings, as two tabs. The profile (name and title) is saved to the
	 * account; appearance is how this browser shows Daidal: the theme and its colours, a colour-vision condition (which strikes the
	 * colours that collide under it from the tag pickers, and can be simulated) and icon-only cards when presenting.
	 */
	let {
		me,
		settings,
		light,
		onchange,
		onsave,
		ondownload,
		ondelete,
		ai,
		tab = $bindable('profile')
	}: {
		me: Me;
		settings: Settings;
		/** Whether the theme comes out light now (for "Match system"). */
		light: boolean;
		onchange: (change: Partial<Settings>) => void;
		onsave: (profile: { name: string; title: string }) => Promise<void>;
		/** Downloads everything Daidal keeps about you; without it the Your data section has no download. */
		ondownload?: () => Promise<void>;
		/** Deletes the account, given the typed confirmation; without it there's no delete. */
		ondelete?: (confirm: string) => Promise<void>;
		/** The AI access tab's content (access tokens); without it there's no such tab. */
		ai?: Snippet;
		tab?: 'profile' | 'appearance' | 'ai';
	} = $props();

	let name = $state('');
	let title = $state('');
	let busy = $state(false);
	let failed = $state('');
	let saved = $state(false);
	$effect.pre(() => {
		name = me.name;
		title = me.title;
	});
	const changed = $derived(name.trim() !== me.name || title.trim() !== me.title);

	// Your data: a download, and deleting the account once you've typed your email.
	let dataBusy = $state(false);
	let dataFailed = $state('');
	let deleting = $state(false);
	let typed = $state('');
	const confirmed = $derived(typed.trim().toLowerCase() === me.email);

	async function run(action: () => Promise<void>, what: string) {
		dataBusy = true;
		dataFailed = '';
		try {
			await action();
		} catch (err) {
			dataFailed = `Couldn't ${what}: ${err instanceof Error ? err.message : 'unknown error'}`;
		} finally {
			dataBusy = false;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		failed = '';
		try {
			await onsave({ name: name.trim() || me.name, title: title.trim() });
			saved = true;
		} catch (err) {
			failed = `Couldn't save: ${err instanceof Error ? err.message : 'unknown error'}`;
		} finally {
			busy = false;
		}
	}

	const THEMES = [
		{ id: 'dark', label: 'Dark' },
		{ id: 'light', label: 'Light' },
		{ id: 'system', label: 'Match system' }
	] as const;
	const palettes = PALETTES.map(p => ({ label: p.label, colors: [...p.colors] }));
	const condition = $derived(settings.condition);
	const conditionLabel = $derived(CONDITIONS.find(c => c.id === condition)?.label ?? '');
	const kept = $derived(palettes.map(p => distinguishable(p.colors, condition)));
	const keptCount = $derived(kept.reduce((n, k) => n + k.length, 0));
	const total = palettes.reduce((n, p) => n + p.colors.length, 0);
</script>

<div class="profile-sheet">
	<div class="tabs" role="tablist" aria-label="Settings">
		<button type="button" role="tab" aria-selected={tab === 'profile'} onclick={() => (tab = 'profile')}>Profile</button>
		<button type="button" role="tab" aria-selected={tab === 'appearance'} onclick={() => (tab = 'appearance')}>Appearance</button>
		{#if ai}<button type="button" role="tab" aria-selected={tab === 'ai'} onclick={() => (tab = 'ai')}>AI access</button>{/if}
	</div>

	{#if tab === 'profile'}
		<form class="section" onsubmit={save} aria-label="Profile">
			<label class="field">
				<span>Name</span>
				<input class="input" maxlength="100" bind:value={name} oninput={() => (saved = false)} />
			</label>
			<label class="field">
				<span>Title</span>
				<input class="input" maxlength="100" placeholder="What you do, say “Platform engineer”" bind:value={title} oninput={() => (saved = false)} />
			</label>
			<label class="field">
				<span>Email</span>
				<input class="input" value={me.email} readonly aria-describedby="email-note" />
			</label>
			<p class="note" id="email-note">Your email comes from your sign-in and can't be changed here.</p>
			<div class="row">
				<button type="submit" class="btn btn-primary" disabled={busy || !changed}>Save profile</button>
				{#if saved && !changed}<span class="ok" role="status">Saved</span>{/if}
			</div>
			{#if failed}<p class="error" role="alert">{failed}</p>{/if}
		</form>
		{#if ondownload || ondelete}
			<section class="section your-data" aria-label="Your data">
				<h3>Your data</h3>
				{#if ondownload}
					<p class="note">One file with your profile, every workspace you own with its diagrams and history (it imports as a backup), the workspaces you're in, and your access tokens' names.</p>
					<div class="row">
						<button type="button" class="btn btn-secondary" disabled={dataBusy} onclick={() => run(ondownload, 'download your data')}>Download my data</button>
					</div>
				{/if}
				{#if ondelete}
					{#if !deleting}
						<div class="row">
							<button type="button" class="btn btn-secondary danger" onclick={() => (deleting = true)}>Delete my account…</button>
						</div>
					{:else}
						<div class="confirm" role="group" aria-label="Delete my account">
							<p>
								This deletes your account for good: your personal workspace and every workspace you own, with their diagrams and history, and
								your access tokens. Diagrams you made in other people's workspaces stay there, now theirs. Download your data first if you want a copy.
							</p>
							<label class="field">
								<span>Type your email ({me.email}) to confirm</span>
								<input class="input" autocomplete="off" bind:value={typed} />
							</label>
							<div class="row">
								<button type="button" class="btn btn-ghost" onclick={() => ((deleting = false), (typed = ''))}>Keep my account</button>
								<button type="button" class="btn btn-secondary danger" disabled={!confirmed || dataBusy} onclick={() => run(() => ondelete(typed.trim()), 'delete your account')}>Delete everything</button>
							</div>
						</div>
					{/if}
				{/if}
				{#if dataFailed}<p class="error" role="alert">{dataFailed}</p>{/if}
			</section>
		{/if}
	{:else if tab === 'ai' && ai}
		<section class="section" aria-label="AI access">{@render ai()}</section>
	{:else}
		<section class="section" aria-label="Theme">
			<h3>Theme</h3>
			<div class="choices" role="radiogroup" aria-label="Theme">
				{#each THEMES as t (t.id)}
					<button type="button" role="radio" aria-checked={settings.theme === t.id} onclick={() => onchange({ theme: t.id })}>{t.label}</button>
				{/each}
			</div>
			<p class="note">
				{settings.theme === 'system' ? `Following your system: light or dark as it is (${light ? 'light' : 'dark'} now).` : 'Applies everywhere, presenting included.'}
			</p>
		</section>

		{#snippet swatches(label: string, list: readonly Palette[], current: string, pick: (id: string) => void)}
			<div class="grounds" role="radiogroup" aria-label={label}>
				{#each list as p (p.id)}
					<button type="button" role="radio" class="ground" aria-checked={current === p.id} onclick={() => pick(p.id)}>
						<span class="chip" aria-hidden="true" style:background={p.swatch[0]}>
							<span class="panel" style:background={p.swatch[1]}></span>
							<span class="mark" style:background={p.swatch[2]}></span>
						</span>
						{p.label}
					</button>
				{/each}
			</div>
		{/snippet}
		<section class="section" aria-label="Colours">
			<h3>Colours</h3>
			<span class="sub-label">Dark</span>
			{@render swatches('Dark colours', DARK_PALETTES, settings.darkPalette, id => onchange({ darkPalette: id as Settings['darkPalette'] }))}
			<span class="sub-label">Light</span>
			{@render swatches('Light colours', LIGHT_PALETTES, settings.lightPalette, id => onchange({ lightPalette: id as Settings['lightPalette'] }))}
			<p class="note">Each theme keeps its own colours. The {light ? 'light' : 'dark'} ones show now.</p>
		</section>

		<section class="section" aria-label="Colour vision">
			<h3>Colour vision</h3>
			<div class="choices wrap" role="radiogroup" aria-label="Colour vision">
				{#each CONDITIONS as c (c.id)}
					<button type="button" role="radio" aria-checked={condition === c.id} onclick={() => onchange({ condition: c.id })}>{c.label}</button>
				{/each}
			</div>
			<p class="note">
				{condition === 'none'
					? 'Tag colour pickers offer every colour.'
					: `Colours that collide under ${conditionLabel} are struck from the tag colour pickers: ${keptCount} of ${total} left.`}
			</p>
			<div class="palettes">
				{#each palettes as p, i (p.label)}
					<div class="palette">
						<span class="p-label">{p.label}<span class="p-count">{condition === 'none' ? `${p.colors.length} colours` : `${kept[i].length} of ${p.colors.length} told apart`}</span></span>
						<span class="swatches" aria-hidden="true">
							{#each p.colors as c (c)}
								<span class="swatch" class:struck={!kept[i].includes(c)} style:background={settings.simulate ? simColor(c, condition) : c}></span>
							{/each}
						</span>
					</div>
				{/each}
			</div>
			<label class="switch" class:off={condition === 'none'}>
				<input type="checkbox" checked={settings.simulate} disabled={condition === 'none'} onchange={() => onchange({ simulate: !settings.simulate })} />
				Simulate it: draw the whole app as {condition === 'none' ? 'the condition' : conditionLabel} shows it
			</label>
		</section>

		<section class="section" aria-label="Presenting">
			<h3>Presenting</h3>
			<label class="switch">
				<input type="checkbox" checked={settings.iconCards} onchange={() => onchange({ iconCards: !settings.iconCards })} />
				Icon-only cards: each node as its icon and name
			</label>
			<p class="note">Also in the bar while presenting. These settings stay in this browser.</p>
		</section>
	{/if}
</div>

<style>
	.profile-sheet {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 12px 16px 18px;
	}
	.tabs {
		display: flex;
		gap: 4px;
	}
	.tabs button,
	.choices button {
		font: inherit;
		font-size: 12.5px;
		padding: 6px 12px;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-neutral-500);
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}
	.choices {
		display: flex;
		gap: 6px;
	}
	.grounds {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.ground {
		display: flex;
		align-items: center;
		gap: 7px;
		font: inherit;
		font-size: 12.5px;
		padding: 5px 11px 5px 5px;
		border-radius: 8px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.ground[aria-checked='true'] {
		border-color: var(--color-accent);
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}
	.chip {
		position: relative;
		width: 34px;
		height: 22px;
		border-radius: 5px;
		border: 1px solid var(--color-divider);
		overflow: hidden;
		flex: none;
	}
	.chip .panel {
		position: absolute;
		inset: 5px 5px 0 12px;
		border-top-left-radius: 3px;
		border-top-right-radius: 3px;
	}
	.chip .mark {
		position: absolute;
		left: 4px;
		top: 4px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.sub-label {
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.choices.wrap {
		flex-wrap: wrap;
	}
	.choices button {
		border-color: var(--color-divider);
		color: var(--color-neutral-400);
	}
	.choices button[aria-checked='true'] {
		border-color: var(--color-accent);
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	h3 {
		margin: 0;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		min-height: 34px;
		padding: 5px 9px;
		font-size: 13px;
	}
	.input[readonly] {
		color: var(--color-neutral-500);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ok {
		font-size: 12px;
		color: var(--color-neutral-400);
	}
	.note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
	}
	.palettes {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.palette {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.p-label {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
	}
	.p-count {
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.swatch {
		width: 18px;
		height: 18px;
		border-radius: 5px;
	}
	.swatch.struck {
		opacity: 0.25;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.switch.off {
		opacity: 0.55;
		cursor: default;
	}
	.switch input {
		accent-color: var(--color-accent);
		width: 16px;
		height: 16px;
		margin: 0;
		flex: none;
	}
	.your-data {
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	.confirm p {
		margin: 0 0 8px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--color-neutral-300);
	}
	.danger {
		color: var(--color-danger, #e5767b);
		border-color: currentColor;
	}
	.error {
		margin: 0;
		font-size: 12px;
		color: var(--color-danger, #e5767b);
	}
</style>
