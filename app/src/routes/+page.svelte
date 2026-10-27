<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createApi } from '#lib/api.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DiagramCard from '#lib/components/DiagramCard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import WorkspaceSheet from '#lib/components/WorkspaceSheet.svelte';
	import { slug } from '#lib/diagram/model.ts';
	import type { ListedDiagram, Workspace } from '#lib/types.ts';

	let { data } = $props();

	const mine = $derived(data.workspaces.filter(w => w.ownerEmail === data.me.email));
	const shared = $derived(data.workspaces.filter(w => w.ownerEmail !== data.me.email));
	const wsHref = (w: Workspace) => `${resolve('/')}?ws=${encodeURIComponent(w.id)}`;
	const now = Date.now();

	// The cards: the first lot comes with the page, Show more fetches the next. Searching reloads the page with ?q=
	// (so a search can be shared or kept on a reload), a moment after typing stops.
	let later = $state<ListedDiagram[]>([]);
	let exhausted = $state(false);
	let loadingMore = $state(false);
	let search = $state('');
	$effect.pre(() => {
		const d = data;
		untrack(() => {
			later = [];
			exhausted = d.diagrams.length < d.pageSize;
			search = d.search;
		});
	});
	const cards = $derived([...data.diagrams, ...later]);
	async function showMore() {
		if (!data.workspace) return;
		loadingMore = true;
		try {
			const next = await api.diagrams(data.workspace.id, { search: data.search, limit: data.pageSize, offset: cards.length });
			later = [...later, ...next];
			exhausted = next.length < data.pageSize;
		} catch (err) {
			notice = { text: `Couldn't load more: ${err instanceof Error ? err.message : 'something went wrong'}.`, failed: true };
		} finally {
			loadingMore = false;
		}
	}
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function searchFor(text: string) {
		search = text;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			if (!data.workspace) return;
			const params = new URLSearchParams({ ws: data.workspace.id });
			if (text.trim()) params.set('q', text.trim());
			void goto(`${resolve('/')}?${params}`, { replace: true, reset: false });
		}, 250);
	}
	const count = $derived(`${cards.length}${exhausted ? '' : '+'} ${cards.length === 1 && exhausted ? 'diagram' : 'diagrams'}`);

	// A new, empty diagram in the workspace on show; it opens straight away, ready for + Add.
	const api = createApi(fetch);
	let creating = $state(false);
	let newName = $state('');
	let busy = $state(false);
	let failed = $state('');
	// Workspaces: make one, manage the one on show, export it, or import a backup as new ones.
	let newWorkspace = $state(false);
	let wsName = $state('');
	let managing = $state(false);
	let notice = $state<{ text: string; failed: boolean } | null>(null);
	const showWorkspace = (id: string) => goto(`${resolve('/')}?ws=${encodeURIComponent(id)}`, { invalidateAll: true });
	async function createWorkspace(e: SubmitEvent) {
		e.preventDefault();
		const name = wsName.trim();
		if (!name) return;
		busy = true;
		failed = '';
		try {
			const made = await api.createWorkspace(name);
			newWorkspace = false;
			wsName = '';
			await showWorkspace(made.id);
		} catch (err) {
			failed = err instanceof Error ? err.message : "Couldn't create the workspace";
		} finally {
			busy = false;
		}
	}
	async function exportWorkspace() {
		if (!data.workspace) return;
		const backup = await api.exportWorkspace(data.workspace.id);
		const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${slug(data.workspace.name)}.skope-backup.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
	async function deleteWorkspace() {
		if (!data.workspace) return;
		await api.deleteWorkspace(data.workspace.id);
		managing = false;
		await goto(resolve('/'), { invalidateAll: true });
	}
	let picker = $state<HTMLInputElement>();
	async function importBackup(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!file) return;
		notice = null;
		let backup: unknown;
		try {
			backup = JSON.parse(await file.text());
		} catch {
			notice = { text: `“${file.name}” isn't a Skope backup: it isn't JSON.`, failed: true };
			return;
		}
		try {
			const { workspaces } = await api.importBackup(backup);
			const first = workspaces.find(w => !w.personal) ?? workspaces[0];
			const diagrams = workspaces.reduce((n, w) => n + w.diagrams, 0);
			notice = { text: `Imported ${workspaces.map(w => `“${w.name}”`).join(', ')}: ${diagrams} ${diagrams === 1 ? 'diagram' : 'diagrams'}.`, failed: false };
			if (first) await showWorkspace(first.id);
		} catch (err) {
			notice = { text: `Couldn't import “${file.name}”: ${err instanceof Error ? err.message : 'something went wrong'}.`, failed: true };
		}
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		const name = newName.trim();
		if (!name || !data.workspace) return;
		busy = true;
		failed = '';
		try {
			const made = await api.createDiagram({ workspace: data.workspace.id, name, doc: { version: 1, diagram: { name } } });
			creating = false;
			newName = '';
			await goto(resolve('/d/[id]', { id: made.id }));
		} catch (err) {
			failed = err instanceof Error ? err.message : "Couldn't create the diagram";
		} finally {
			busy = false;
		}
	}
</script>

<AppHeader me={data.me} homeHref={resolve('/')} crumbs={data.workspace ? [{ label: data.workspace.name }] : []} />

<div class="body">
	<nav class="side" aria-label="Workspaces">
		<h2>Your workspaces</h2>
		<ul>
			{#each mine as w (w.id)}
				<li>
					<a href={wsHref(w)} aria-current={w.id === data.workspace?.id ? 'page' : undefined}>
						<span class="ws-name">{w.name}</span>
						{#if w.members.length > 1}<span class="count" title="{w.members.length} members"><Icon name="members" size={12} />{w.members.length}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
		{#if shared.length}
			<h2>Shared with you</h2>
			<ul>
				{#each shared as w (w.id)}
					<li>
						<a href={wsHref(w)} aria-current={w.id === data.workspace?.id ? 'page' : undefined}>
							<span class="ws-name">{w.name}</span>
							<span class="owner">{w.ownerEmail}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="side-actions">
			<button type="button" class="side-btn" onclick={() => (newWorkspace = true)}>+ New workspace</button>
			<button type="button" class="side-btn" onclick={() => picker?.click()}>Import a backup…</button>
			<input bind:this={picker} type="file" accept=".json,application/json" hidden aria-label="Backup file to import" onchange={importBackup} />
		</div>
	</nav>

	<main class="list">
		{#if notice}<p class="notice" class:failed={notice.failed} role={notice.failed ? 'alert' : 'status'}>{notice.text}</p>{/if}
		{#if data.workspace}
			<div class="heading">
				<h1>{data.workspace.name}</h1>
				<span class="n" data-testid="diagram-count">{data.search ? `${count} with “${data.search}”` : count}</span>
				{#if data.workspace.ownerEmail !== data.me.email}<span class="tag tag-outline">Shared by {data.workspace.ownerEmail}</span>{/if}
				<button type="button" class="btn btn-ghost manage" aria-label="Manage {data.workspace.name}" onclick={() => (managing = true)}>
					<Icon name="members" size={14} />{data.workspace.ownerEmail === data.me.email ? 'Manage' : 'Members'}
				</button>
				<button type="button" class="btn btn-primary new" onclick={() => (creating = true)}>+ New diagram</button>
			</div>
			<label class="search">
				<Icon name="magnifyingGlass" size={14} />
				<input
					type="search"
					class="input"
					placeholder="Search diagrams and their nodes"
					aria-label="Search diagrams"
					value={search}
					oninput={e => searchFor(e.currentTarget.value)}
					onkeydown={e => e.key === 'Escape' && search && searchFor('')}
				/>
			</label>
			{#if cards.length}
				<div class="grid">
					{#each cards as d (d.id)}
						<DiagramCard diagram={d} href={resolve('/d/[id]', { id: d.id })} search={data.search} {now} />
					{/each}
				</div>
				{#if !exhausted}
					<button type="button" class="btn btn-secondary more" disabled={loadingMore} onclick={showMore}>{loadingMore ? 'Loading…' : 'Show more'}</button>
				{/if}
			{:else if data.search}
				<div class="empty">
					<span class="empty-icon"><Icon name="magnifyingGlass" size={30} /></span>
					<h2>Nothing matches “{data.search}”</h2>
					<p>Search looks through diagram names and the names of their nodes.</p>
				</div>
			{:else}
				<div class="empty">
					<span class="empty-icon"><Icon name="folder" size={30} /></span>
					<h2>No diagrams here yet</h2>
					<p>Start one with <strong>+ New diagram</strong>, or copy one from another workspace from its name in the header.</p>
				</div>
			{/if}
		{/if}
	</main>
</div>

<Sheet open={newWorkspace} title="New workspace" onclose={() => (newWorkspace = false)}>
	<form class="create" onsubmit={createWorkspace}>
		<label>
			<span>Name</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input" maxlength="100" placeholder="e.g. Platform team" autofocus bind:value={wsName} />
		</label>
		<p class="where">Yours to start with. Add people to it from <strong>Manage</strong>.</p>
		{#if failed}<p class="error" role="alert">{failed}</p>{/if}
		<button type="submit" class="btn btn-primary" disabled={busy || !wsName.trim()}>Create workspace</button>
	</form>
</Sheet>
{#if data.workspace}
	{@const ws = data.workspace}
	<Sheet open={managing} title={ws.name} onclose={() => (managing = false)}>
		<WorkspaceSheet
			workspace={ws}
			me={data.me.email}
			onrename={async name => {
				await api.renameWorkspace(ws.id, name);
				await invalidateAll();
			}}
			onadd={async email => {
				await api.addMember(ws.id, email);
				await invalidateAll();
			}}
			onremove={async email => {
				await api.removeMember(ws.id, email);
				await invalidateAll();
			}}
			onexport={exportWorkspace}
			ondelete={deleteWorkspace}
		/>
	</Sheet>
{/if}
<Sheet open={creating} title="New diagram" onclose={() => (creating = false)}>
	<form class="create" onsubmit={create}>
		<label>
			<span>Name</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input" maxlength="100" placeholder="e.g. checkout-platform" autofocus bind:value={newName} />
		</label>
		<p class="where">In <strong>{data.workspace?.name}</strong>. It opens empty, ready for <strong>+ Add</strong>.</p>
		{#if failed}<p class="error" role="alert">{failed}</p>{/if}
		<button type="submit" class="btn btn-primary" disabled={busy || !newName.trim()}>Create diagram</button>
	</form>
</Sheet>

<style>
	.body {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.side {
		width: 212px;
		flex: none;
		border-right: 1px solid var(--color-divider);
		padding: 16px 10px;
		overflow-y: auto;
	}
	.side h2 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 6px 10px 6px;
	}
	.side ul {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.side a {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: 8px;
		font-size: 13px;
		color: var(--color-neutral-400);
		text-decoration: none;
	}
	.side a:hover {
		background: color-mix(in srgb, var(--color-text) 6%, transparent);
		color: var(--color-text);
	}
	.side a[aria-current='page'] {
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}
	.ws-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count,
	.owner {
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: 11px;
		color: var(--color-neutral-600);
	}
	.owner {
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding: 26px 28px;
	}
	.heading {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 18px;
	}
	h1 {
		font-family: var(--font-heading);
		font-size: 19px;
		font-weight: 500;
		margin: 0;
	}
	.n {
		font-size: 12px;
		color: var(--color-neutral-500);
	}
	.heading .tag {
		font-size: 10px;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
		max-width: 420px;
		margin-bottom: 18px;
		color: var(--color-neutral-500);
	}
	.search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}
	.search .input {
		width: 100%;
		box-sizing: border-box;
		min-height: 36px;
		padding: 6px 10px 6px 32px;
		font-size: 13px;
	}
	.more {
		display: block;
		margin: 22px auto 0;
		font-size: 13px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(258px, 1fr));
		gap: 18px;
	}
	.empty {
		max-width: 420px;
		padding: 38px 0;
	}
	.empty-icon {
		color: var(--color-neutral-700);
		display: flex;
		margin-bottom: 14px;
	}
	.empty h2 {
		font-size: 16px;
		margin: 0 0 7px;
	}
	.empty p {
		font-size: 12.5px;
		line-height: 1.6;
		color: var(--color-neutral-500);
		margin: 0;
	}
	.side-actions {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 6px;
	}
	.side-btn {
		padding: 7px 10px;
		border: 1px dashed var(--color-neutral-700);
		border-radius: 8px;
		background: transparent;
		color: var(--color-neutral-400);
		font: inherit;
		font-size: 12.5px;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
	}
	.side-btn:hover {
		color: var(--color-accent);
		border-color: var(--color-accent-700);
	}
	.notice {
		margin: 0 0 14px;
		padding: 8px 12px;
		border-radius: 8px;
		border: 1px solid var(--color-accent-700);
		font-size: 12.5px;
		color: var(--color-accent-200);
	}
	.notice.failed {
		border-color: var(--color-danger, #e5767b);
		color: var(--color-danger, #e5767b);
	}
	@media (max-width: 720px) {
		/* First in the row, so they're in sight without scrolling past every workspace. */
		.side-actions {
			order: -1;
			flex-direction: row;
			margin-top: 0;
			gap: 6px;
		}
		/* The workspace list becomes a row of chips above the diagrams. */
		.body {
			flex-direction: column;
		}
		.side {
			width: auto;
			border-right: none;
			border-bottom: 1px solid var(--color-divider);
			padding: 8px 12px;
			overflow-x: auto;
			display: flex;
			gap: 6px;
		}
		.side h2 {
			display: none;
		}
		.side ul {
			flex-direction: row;
			margin: 0;
			gap: 6px;
		}
		.side a {
			white-space: nowrap;
			border: 1px solid var(--color-divider);
			padding: 5px 10px;
		}
		.owner {
			display: none;
		}
		.list {
			padding: 18px 16px;
		}
	}
	.heading .manage {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.heading .new {
		font-size: 13px;
		padding: 6px 12px;
	}
	.create {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 16px 18px;
	}
	.create label {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.create .input {
		width: 100%;
		box-sizing: border-box;
		min-height: 36px;
		font-size: 13.5px;
	}
	.where,
	.error {
		margin: 0;
		font-size: 12px;
		color: var(--color-neutral-400);
	}
	.error {
		color: var(--color-danger, #e5767b);
	}
	.create .btn {
		align-self: flex-start;
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.create .input,
		.search .input {
			font-size: 16px;
		}
	}
</style>
