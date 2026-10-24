<script lang="ts">
	import { resolve } from '$app/paths';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DiagramCard from '#lib/components/DiagramCard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import type { Workspace } from '#lib/types.ts';

	let { data } = $props();

	const mine = $derived(data.workspaces.filter(w => w.ownerEmail === data.me.email));
	const shared = $derived(data.workspaces.filter(w => w.ownerEmail !== data.me.email));
	const wsHref = (w: Workspace) => `${resolve('/')}?ws=${encodeURIComponent(w.id)}`;
	const now = Date.now();
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
	</nav>

	<main class="list">
		{#if data.workspace}
			<div class="heading">
				<h1>{data.workspace.name}</h1>
				<span class="n">{data.diagrams.length} {data.diagrams.length === 1 ? 'diagram' : 'diagrams'}</span>
				{#if data.workspace.ownerEmail !== data.me.email}<span class="tag tag-outline">Shared by {data.workspace.ownerEmail}</span>{/if}
			</div>
			{#if data.diagrams.length}
				<div class="grid">
					{#each data.diagrams as d (d.id)}
						<DiagramCard diagram={d} href={resolve('/d/[id]', { id: d.id })} leadName={d.leadId ? data.leadNames[d.leadId] : null} {now} />
					{/each}
				</div>
			{:else}
				<div class="empty">
					<span class="empty-icon"><Icon name="folder" size={30} /></span>
					<h2>No diagrams here yet</h2>
					<p>Diagrams are still created in the prototype. Once they're saved to the server, they show up here.</p>
				</div>
			{/if}
		{/if}
	</main>
</div>

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
	@media (max-width: 720px) {
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
</style>
