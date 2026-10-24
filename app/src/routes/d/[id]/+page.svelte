<script lang="ts">
	import { resolve } from '$app/paths';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DiagramCanvas from '#lib/components/DiagramCanvas.svelte';
	import HistoryPanel from '#lib/components/HistoryPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Inspector from '#lib/components/Inspector.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import TagPanel from '#lib/components/TagPanel.svelte';
	import { tagsOn, toScene } from '#lib/diagram/model.ts';
	import { followState } from '#lib/follow.ts';
	import { ago } from '#lib/time.ts';

	let { data } = $props();

	const workspace = $derived(data.workspaces.find(w => w.id === data.diagram.workspaceId));
	// The snapshot being replayed, or null for the working copy.
	let replaying = $state<string | null>(null);
	const replayed = $derived(replaying ? data.snapshots.find(s => s.id === replaying) : undefined);
	const scene = $derived(toScene(replayed?.doc ?? data.diagram.doc));

	// View and tag switches are only what this browser shows; nothing is saved.
	let view = $state<string | null>(null);
	let on = $state<Record<string, boolean>>({});
	let selected = $state<string | null>(null);
	$effect.pre(() => {
		// A new diagram or snapshot starts from its own saved view.
		view = scene.initialView;
		on = tagsOn(scene, scene.initialView);
		selected = null;
	});

	const tagByKey = $derived(Object.fromEntries(scene.tags.map(t => [t.key, t])));
	const selectedNode = $derived(selected ? scene.nodes.find(n => n.id === selected) : undefined);
	const follow = $derived(followState(data.diagram, data.lead));
	const mine = $derived(data.diagram.ownerEmail === data.me.email);
	const now = Date.now();

	// Phones and small tablets get the canvas full width; views, history and details open as sheets from a toolbar.
	const NARROW = '(max-width: 900px)';
	let narrow = $state(typeof matchMedia === 'function' && matchMedia(NARROW).matches);
	$effect(() => {
		const mq = matchMedia(NARROW);
		const update = () => (narrow = mq.matches);
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});
	let sheet = $state<'views' | 'history' | 'details' | null>(null);
	function select(id: string | null) {
		selected = id;
		// On a phone the details are out of sight, so tapping a node brings them up.
		if (narrow && id) sheet = 'details';
	}
	const setView = (v: string | null) => {
		view = v;
		on = tagsOn(scene, v);
	};
	const toggleTag = (k: string) => {
		on = { ...on, [k]: !on[k] };
		view = null;
	};
	const pick = (id: string | null) => {
		replaying = id;
		sheet = null;
	};
</script>

<svelte:head><title>{data.diagram.name} · Skope</title></svelte:head>

<AppHeader
	me={data.me}
	homeHref={resolve('/')}
	crumbs={[
		...(workspace ? [{ label: workspace.name, href: `${resolve('/')}?ws=${encodeURIComponent(workspace.id)}` }] : []),
		{ label: data.diagram.name }
	]}
/>

<div class="strip">
	<span class="meta">
		{#if !mine}Owned by {data.diagram.ownerEmail} · {/if}Updated {ago(data.diagram.updatedAt, now)} · revision {data.diagram.rev}
	</span>
	{#if follow.kind === 'following'}
		<span class="follow" data-testid="follow">
			<Icon name="follow" size={12} />
			Follows <a href={resolve('/d/[id]', { id: follow.leadId })}>{follow.leadName}</a>
			· {follow.syncedLabel ? `synced to “${follow.syncedLabel}”` : 'not synced yet'}
			{#if follow.paused}· paused{:else if follow.newer > 0}· {follow.newer} newer {follow.newer === 1 ? 'snapshot' : 'snapshots'} to review{:else}· up to date{/if}
		</span>
	{:else if follow.kind === 'gone'}
		<span class="follow gone" data-testid="follow">No longer following: its lead was deleted or you left its workspace</span>
	{/if}
</div>

{#if replayed}
	<div class="replay" role="status">
		Replaying “{replayed.label}” · {replayed.authorEmail} · {ago(replayed.createdAt, now)}
		<button type="button" class="btn btn-ghost" onclick={() => (replaying = null)}>Back to the working copy</button>
	</div>
{/if}

{#snippet tags()}
	<TagPanel {scene} {on} {view} onview={setView} ontoggle={toggleTag} />
{/snippet}
{#snippet history()}
	<HistoryPanel snapshots={data.snapshots} current={replaying} onpick={pick} {now} />
{/snippet}

<div class="body">
	{#if !narrow}{@render tags()}{/if}
	<main class="stage" aria-label="Diagram">
		<DiagramCanvas {scene} {on} {selected} onselect={select} />
	</main>
	{#if !narrow}
		<aside class="right">
			{#if selectedNode}<Inspector node={selectedNode} tags={tagByKey} />{/if}
			{@render history()}
		</aside>
	{/if}
</div>

{#if narrow}
	<nav class="toolbar" aria-label="Diagram panels">
		<button type="button" onclick={() => (sheet = 'views')}>
			<span class="t-label">View</span><span class="t-value">{view ?? (scene.views.length ? 'Everything' : 'Tags')}</span>
		</button>
		<button type="button" onclick={() => (sheet = 'history')}>
			<span class="t-label">History</span><span class="t-value">{replayed ? replayed.label : `${data.snapshots.length} ${data.snapshots.length === 1 ? 'snapshot' : 'snapshots'}`}</span>
		</button>
		<button type="button" disabled={!selectedNode} onclick={() => (sheet = 'details')}>
			<span class="t-label">Details</span><span class="t-value">{selectedNode ? selectedNode.name : 'Tap a node'}</span>
		</button>
	</nav>
	<Sheet open={sheet === 'views'} title="Views and tags" onclose={() => (sheet = null)}>{@render tags()}</Sheet>
	<Sheet open={sheet === 'history'} title="History" onclose={() => (sheet = null)}>{@render history()}</Sheet>
	<Sheet open={sheet === 'details' && !!selectedNode} title="Node details" onclose={() => (sheet = null)}>
		{#if selectedNode}<Inspector node={selectedNode} tags={tagByKey} />{/if}
	</Sheet>
{/if}

<style>
	.strip {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		padding: 8px 16px;
		border-bottom: 1px solid var(--color-divider);
		font-size: 12px;
		color: var(--color-neutral-500);
	}
	.follow {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--color-accent-300);
	}
	.follow.gone {
		color: var(--color-neutral-500);
	}
	.replay {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 7px 16px;
		font-size: 12px;
		color: var(--color-accent-200);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		border-bottom: 1px solid var(--color-accent-700);
	}
	.replay .btn {
		font-size: 11.5px;
		padding: 2px 9px;
	}
	.body {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.stage {
		flex: 1;
		min-width: 0;
		position: relative;
	}
	.right {
		width: 260px;
		flex: none;
		overflow-y: auto;
		border-left: 1px solid var(--color-divider);
	}
	.toolbar {
		display: flex;
		flex: none;
		border-top: 1px solid var(--color-divider);
		background: var(--color-surface);
		padding-bottom: env(safe-area-inset-bottom);
	}
	.toolbar button {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 9px 12px;
		min-height: 52px;
		border: none;
		border-right: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.toolbar button:last-child {
		border-right: none;
	}
	.toolbar button:disabled {
		cursor: default;
		opacity: 0.55;
	}
	.t-label {
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
	}
	.t-value {
		max-width: 100%;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 600px) {
		.strip,
		.replay {
			padding: 7px 12px;
			gap: 6px 12px;
		}
		.replay {
			flex-wrap: wrap;
		}
	}
</style>
