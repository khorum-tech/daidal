<script lang="ts">
	import type { DaidalDoc } from '../types';
	import { ConfigError, configText, langOf, readConfig, type ConfigLang } from '@khorum-oss/daidal-core/config';

	/**
	 * The diagram as a config file: the prototype's config dock. It shows the saved document as YAML or JSON; its
	 * owner edits it here (or drops or picks a .daidal.yaml / .daidal.json file) and applies it, replacing the diagram
	 * or merging it in, as one undo step. Anyone can copy or download it. A config that can't be read says why, with
	 * the line for YAML, and nothing changes.
	 */
	let {
		doc,
		editable = false,
		onapply,
		ondownload,
		onclose
	}: {
		doc: DaidalDoc;
		editable?: boolean;
		/** Applies the diagram a config makes; [summary] says what changed. */
		onapply?: (next: DaidalDoc, mode: 'replace' | 'merge', summary: string) => void;
		ondownload?: (text: string, lang: ConfigLang) => void;
		onclose?: () => void;
	} = $props();

	let lang = $state<ConfigLang>('yaml');
	let draft = $state<string | null>(null);
	let mode = $state<'replace' | 'merge'>('replace');
	let problem = $state('');
	let done = $state('');
	let copied = $state(false);
	let dragging = $state(false);
	const generated = $derived(configText(doc, lang));
	const text = $derived(draft ?? generated);
	const dirty = $derived(draft !== null && draft !== generated);

	/** Switching language carries an edit across when it reads; else the edit stays as typed. */
	function switchLang(to: ConfigLang) {
		if (to === lang) return;
		if (dirty && draft !== null) {
			try {
				draft = configText(readConfig(draft, doc, 'replace').doc, to);
			} catch {
				return;
			}
		}
		lang = to;
	}
	function apply() {
		if (!editable) return;
		try {
			const read = readConfig(text, doc, mode);
			onapply?.(read.doc, mode, read.summary);
			draft = null;
			problem = '';
			done = read.summary;
		} catch (e) {
			done = '';
			problem = e instanceof ConfigError ? (e.line ? `Line ${e.line}: ${e.message}` : e.message) : "Couldn't read the config";
		}
	}
	function revert() {
		draft = null;
		problem = '';
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// No clipboard here: the text can still be selected and copied by hand.
		}
	}
	async function take(file: File | undefined) {
		if (!file || !editable) return;
		const body = await file.text();
		lang = /\.json$/i.test(file.name) ? 'json' : langOf(body);
		draft = body;
		problem = '';
		done = `Loaded ${file.name}: check it, then apply`;
	}
	function keys(e: KeyboardEvent) {
		const meta = e.metaKey || e.ctrlKey;
		if (meta && (e.key.toLowerCase() === 's' || e.key === 'Enter')) {
			e.preventDefault();
			apply();
		}
	}
</script>

<section class="config" aria-label="Config">
	<div class="head">
		<!-- In a sheet, the sheet's own title names it. -->
		<h2 class:hidden={!onclose}>Config</h2>
		<div class="langs" role="radiogroup" aria-label="Format">
			{#each [['yaml', 'YAML'], ['json', 'JSON']] as const as [v, label] (v)}
				<button type="button" role="radio" class:on={lang === v} aria-checked={lang === v} onclick={() => switchLang(v)}>{label}</button>
			{/each}
		</div>
		{#if onclose}<button type="button" class="x" aria-label="Close the config" onclick={onclose}>×</button>{/if}
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="area"
		class:dragging
		ondragover={e => {
			if (!editable) return;
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={e => {
			e.preventDefault();
			dragging = false;
			void take(e.dataTransfer?.files[0]);
		}}
	>
		<textarea
			aria-label="Config text"
			spellcheck="false"
			autocomplete="off"
			readonly={!editable}
			value={text}
			oninput={e => {
				draft = e.currentTarget.value;
				done = '';
			}}
			onkeydown={keys}
		></textarea>
	</div>

	{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
	{#if done && !problem}<p class="done" role="status">{done}</p>{/if}

	{#if editable}
		<div class="mode" role="radiogroup" aria-label="How to apply">
			<label><input type="radio" name="config-mode" checked={mode === 'replace'} onchange={() => (mode = 'replace')} />Replace the diagram</label>
			<label><input type="radio" name="config-mode" checked={mode === 'merge'} onchange={() => (mode = 'merge')} />Merge it in</label>
		</div>
		<div class="row">
			<button type="button" class="btn btn-primary" disabled={!dirty && mode === 'replace'} onclick={apply} title="⌘S or ⌘Enter">Apply</button>
			{#if dirty}<button type="button" class="btn btn-ghost" onclick={revert}>Revert</button>{/if}
		</div>
	{/if}
	<div class="row">
		<button type="button" class="btn btn-secondary" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
		<button type="button" class="btn btn-secondary" onclick={() => ondownload?.(text, lang)}>Download .daidal.{lang}</button>
		{#if editable}
			<label class="btn btn-secondary pick">
				Open a file…
				<input type="file" accept=".yaml,.yml,.json,.txt" aria-label="Config file to open" onchange={e => void take(e.currentTarget.files?.[0])} />
			</label>
		{/if}
	</div>
	<p class="note">
		{editable
			? 'Edit the text, or drop a .daidal.yaml or .daidal.json file on it, then apply. Replacing makes the diagram what the config says; merging updates nodes by id and adds what is new. Either can be undone.'
			: 'The diagram as a config file: copy it or download it to keep it, or to open it elsewhere.'}
	</p>
</section>

<style>
	.config {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 14px 16px;
		border-bottom: 1px solid var(--color-divider);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	h2 {
		flex: 1;
		margin: 0;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
	}
	h2.hidden {
		visibility: hidden;
	}
	.langs {
		display: flex;
		gap: 2px;
		padding: 2px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
	}
	.langs button {
		font: inherit;
		font-size: 11px;
		padding: 2px 9px;
		border: none;
		border-radius: 5px;
		background: transparent;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.langs button.on {
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
		color: var(--color-accent);
	}
	.x {
		width: 26px;
		height: 26px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--color-neutral-500);
		font-size: 16px;
		cursor: pointer;
	}
	.area {
		border-radius: 8px;
		border: 1px solid var(--color-divider);
	}
	.area.dragging {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 6%, transparent);
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 360px;
		resize: vertical;
		padding: 10px;
		border: none;
		background: transparent;
		color: var(--color-neutral-200, var(--color-text));
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 11.5px;
		line-height: 1.55;
		white-space: pre;
		tab-size: 2;
		outline: none;
	}
	.problem {
		margin: 0;
		font-size: 12px;
		color: var(--color-danger, #e5767b);
	}
	.done {
		margin: 0;
		font-size: 12px;
		color: var(--color-accent-300);
	}
	.mode {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 12px;
		color: var(--color-neutral-400);
	}
	.mode label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.mode input {
		accent-color: var(--color-accent);
		margin: 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.row .btn {
		font-size: 12px;
	}
	.pick {
		position: relative;
		overflow: hidden;
		cursor: pointer;
	}
	.pick input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		textarea {
			font-size: 16px;
			min-height: 280px;
		}
	}
</style>
