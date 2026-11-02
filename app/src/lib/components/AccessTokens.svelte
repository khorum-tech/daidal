<script lang="ts">
	import type { AccessToken, Workspace } from '../types';

	/**
	 * Profile → AI access: tokens that let an MCP client (Claude, say) or a script read or edit your diagrams as you,
	 * without a browser sign-in. A token's secret is shown once, when it's made; the server keeps only a hash. Ported
	 * from Storybild's access tokens. The calls come in as props, so this can be shown and tested on its own.
	 */
	let {
		workspaces,
		list,
		create,
		revoke,
		origin = typeof location === 'undefined' ? '' : location.origin
	}: {
		workspaces: Workspace[];
		list: () => Promise<AccessToken[]>;
		create: (body: { name: string; scope: AccessToken['scope']; workspaces?: string[] }) => Promise<AccessToken & { token: string }>;
		revoke: (id: string) => Promise<void>;
		/** This site's address, for the MCP server's. */
		origin?: string;
	} = $props();

	let tokens = $state<AccessToken[] | null>(null);
	let problem = $state('');
	let name = $state('');
	let scope = $state<AccessToken['scope']>('write');
	let some = $state(false);
	let chosen = $state<string[]>([]);
	let busy = $state(false);
	let made = $state<{ name: string; token: string } | null>(null);
	let copied = $state<'' | 'token' | 'command'>('');
	let revoking = $state<string | null>(null);

	$effect(() => {
		list().then(
			t => (tokens = t),
			e => {
				problem = e instanceof Error ? e.message : 'Could not load your access tokens.';
				tokens = [];
			}
		);
	});

	const nameOf = (id: string) => workspaces.find(w => w.id === id)?.name ?? 'a workspace no longer yours';
	const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
	const reach = (t: AccessToken) => (t.workspaces ? t.workspaces.map(nameOf).join(', ') : 'All your workspaces');

	/** On this computer there's no Cloudflare Access, so an MCP client signs in with a token instead. */
	const local = $derived(/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin));
	const mcpUrl = $derived(`${origin}/mcp`);
	const command = $derived(made ? `claude mcp add --transport http skope ${mcpUrl} --header "Authorization: Bearer ${made.token}"` : '');
	/** The in-app docs page on connecting AI. */
	const guide = '/app/docs/connecting-ai';

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		problem = '';
		if (!name.trim()) return (problem = 'Give the token a name, such as “Claude on my laptop”.');
		if (some && !chosen.length) return (problem = 'Choose at least one workspace, or allow all of them.');
		busy = true;
		try {
			const { token, ...listed } = await create({ name: name.trim(), scope, ...(some ? { workspaces: chosen } : {}) });
			tokens = [listed, ...(tokens ?? [])];
			made = { name: listed.name, token };
			copied = '';
			name = '';
			chosen = [];
			some = false;
		} catch (err) {
			problem = err instanceof Error ? err.message : 'Could not make the token.';
		} finally {
			busy = false;
		}
	}

	async function copy(what: 'token' | 'command') {
		if (!made) return;
		try {
			await navigator.clipboard.writeText(what === 'token' ? made.token : command);
			copied = what;
		} catch {
			problem = 'Could not copy; select the text and copy it yourself.';
		}
	}

	async function drop(id: string) {
		problem = '';
		try {
			await revoke(id);
			tokens = (tokens ?? []).filter(t => t.id !== id);
		} catch (err) {
			problem = err instanceof Error ? err.message : 'Could not revoke it.';
		} finally {
			revoking = null;
		}
	}
</script>

<div class="tokens">
	<div class="connect" role="note" aria-label="Connect an MCP client">
		<p class="connect-title">MCP server: <code>{mcpUrl}</code></p>
		{#if local}
			<p class="note">On this computer there's no Cloudflare Access, so make a token below and use the Claude Code command it gives you.</p>
		{:else}
			<p class="note">
				Claude Code: run <code>claude mcp add --transport http skope {mcpUrl}</code>, then sign in when it asks. In claude.ai or Claude Desktop, add a custom connector with
				this address. No token needed: they act as you.
			</p>
		{/if}
		<a class="link" href={guide}>How to connect, what to ask, and troubleshooting</a>
	</div>

	{#if made}
		<div class="made" role="status">
			<p class="made-title">“{made.name}” is ready. Copy it now: it won't be shown again.</p>
			<div class="row">
				<input class="input mono" readonly value={made.token} aria-label="Your new token" onfocus={e => e.currentTarget.select()} />
				<button class="btn btn-primary" type="button" onclick={() => copy('token')}>{copied === 'token' ? 'Copied' : 'Copy'}</button>
			</div>
			{#if local}
				<p class="note">To connect Claude Code to this computer's Skope with it, run:</p>
				<div class="row">
					<textarea class="input mono command" readonly rows="3" aria-label="Claude Code command" value={command} onfocus={e => e.currentTarget.select()}></textarea>
					<button class="btn btn-secondary" type="button" onclick={() => copy('command')}>{copied === 'command' ? 'Copied' : 'Copy'}</button>
				</div>
			{:else}
				<p class="note">Send it as <code>Authorization: Bearer …</code> from a script or a local copy of Skope. Online, MCP clients sign in instead (above).</p>
			{/if}
			<button class="btn btn-ghost done" type="button" onclick={() => (made = null)}>Done</button>
		</div>
	{/if}

	{#if tokens === null}
		<p class="note">Loading…</p>
	{:else if tokens.length}
		<ul class="list" aria-label="Your access tokens">
			{#each tokens as t (t.id)}
				<li>
					<div class="token-text">
						<span class="token-name">{t.name}</span>
						<span class="meta">
							<span class="badge">{t.scope === 'write' ? 'Read and write' : 'Read'}</span>
							{reach(t)} · made {day(t.createdAt)} · {t.lastUsedAt ? `last used ${day(t.lastUsedAt)}` : 'never used'}
						</span>
					</div>
					{#if revoking === t.id}
						<span class="row">
							<button class="btn btn-secondary danger" type="button" onclick={() => drop(t.id)}>Revoke “{t.name}”</button>
							<button class="btn btn-ghost" type="button" onclick={() => (revoking = null)}>Keep</button>
						</span>
					{:else}
						<button class="btn btn-ghost" type="button" aria-label="Revoke {t.name}…" onclick={() => (revoking = t.id)}>Revoke…</button>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="note">No access tokens yet.</p>
	{/if}

	<form class="new" onsubmit={submit} aria-label="New access token">
		<label class="field"><span>Name</span><input class="input" bind:value={name} maxlength="60" placeholder="Claude on my laptop" /></label>
		<div class="field">
			<span>Can</span>
			<div class="choices" role="radiogroup" aria-label="What the token can do">
				<button type="button" role="radio" aria-checked={scope === 'read'} onclick={() => (scope = 'read')}>Read</button>
				<button type="button" role="radio" aria-checked={scope === 'write'} onclick={() => (scope = 'write')}>Read and write</button>
			</div>
		</div>
		<div class="field">
			<label class="check"><input type="checkbox" bind:checked={some} />Only some workspaces</label>
			{#if some}
				<div class="choose">
					{#each workspaces as w (w.id)}
						<label class="check"><input type="checkbox" value={w.id} bind:group={chosen} />{w.name}</label>
					{/each}
				</div>
			{/if}
		</div>
		{#if problem}<p class="error" role="alert">{problem}</p>{/if}
		<div><button class="btn btn-secondary" type="submit" disabled={busy}>{busy ? 'Making…' : 'Create token'}</button></div>
	</form>
</div>

<style>
	.tokens {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.connect,
	.made {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		border: 1px solid var(--color-divider);
		border-radius: 9px;
	}
	.made {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	}
	.connect-title,
	.made-title {
		margin: 0;
		font-size: 12.5px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--color-neutral-500);
		overflow-wrap: anywhere;
	}
	.link {
		align-self: flex-start;
		font-size: 12px;
		color: var(--color-accent);
	}
	code,
	.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11.5px;
	}
	.row {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		min-width: 0;
	}
	.input {
		width: 100%;
		box-sizing: border-box;
		min-height: 34px;
		padding: 5px 9px;
		font-size: 13px;
	}
	.mono {
		flex: 1;
		min-width: 0;
	}
	.command {
		resize: none;
		line-height: 1.4;
	}
	.btn {
		font-size: 12.5px;
		flex: none;
	}
	.done {
		align-self: flex-start;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.list li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-divider);
	}
	.token-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.token-name {
		font-size: 13px;
		font-weight: 600;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.badge {
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--color-divider);
	}
	.new {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px solid var(--color-divider);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.choices {
		display: flex;
		gap: 6px;
	}
	.choices button {
		font: inherit;
		font-size: 12.5px;
		padding: 6px 12px;
		border-radius: 8px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.choices button[aria-checked='true'] {
		border-color: var(--color-accent);
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 12.5px;
		color: var(--color-neutral-300);
		cursor: pointer;
	}
	.check input {
		accent-color: var(--color-accent);
	}
	.choose {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding-left: 14px;
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
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.input {
			font-size: 16px;
		}
	}
</style>
