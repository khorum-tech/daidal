<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createApi } from '#lib/api.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DiagramCanvas from '#lib/components/DiagramCanvas.svelte';
	import HistoryPanel from '#lib/components/HistoryPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Inspector from '#lib/components/Inspector.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import TagPanel from '#lib/components/TagPanel.svelte';
	import { tagsOn, toScene } from '#lib/diagram/model.ts';
	import { followState } from '#lib/follow.ts';
	import { Saver } from '#lib/saver.svelte.ts';
	import type { Diagram } from '#lib/types.ts';
	import { ago } from '#lib/time.ts';

	let { data } = $props();

	const workspace = $derived(data.workspaces.find(w => w.id === data.diagram.workspaceId));
	const api = createApi(fetch);

	// The working copy as edited here, and what saves it. Both start over whenever a diagram (re)loads.
	const start = (d: Diagram) => ({ doc: structuredClone(d.doc), saver: new Saver((rev, doc) => api.save(d.id, { rev, doc }), d.rev) });
	let loaded = untrack(() => data.diagram);
	let working = $state(start(loaded));
	// The snapshot being replayed, or null for the working copy.
	let replaying = $state<string | null>(null);
	$effect.pre(() => {
		if (data.diagram === loaded) return;
		loaded = data.diagram;
		working = start(loaded);
		replaying = null;
	});
	const replayed = $derived(replaying ? data.snapshots.find(s => s.id === replaying) : undefined);
	const scene = $derived(toScene(replayed?.doc ?? working.doc));

	// View and tag switches are only what this browser shows; nothing is saved.
	let view = $state<string | null>(null);
	let on = $state<Record<string, boolean>>({});
	let selected = $state<string | null>(null);
	$effect.pre(() => {
		// A new diagram or snapshot starts from its own saved view. Moving a node changes the scene too, but keeps
		// the view, so this reads which document is shown, not the scene itself.
		void [replaying, working];
		untrack(() => {
			view = scene.initialView;
			on = tagsOn(scene, scene.initialView);
			selected = null;
		});
	});

	const tagByKey = $derived(Object.fromEntries(scene.tags.map(t => [t.key, t])));
	const selectedNode = $derived(selected ? scene.nodes.find(n => n.id === selected) : undefined);
	const follow = $derived(followState(data.diagram, data.lead));
	const mine = $derived(data.diagram.ownerEmail === data.me.email);
	const now = Date.now();

	// Moving nodes is the one edit so far: only on your own diagram, and not while replaying history.
	const editable = $derived(mine && !replayed && working.saver.state !== 'conflict');
	function moveNode(id: string, x: number, y: number) {
		const node = working.doc.nodes?.find(n => n.id === id);
		if (!node) return;
		node.layout = { ...(node.layout ?? { x, y }), x, y };
		working.saver.queue($state.snapshot(working.doc));
	}
	// Don't let a change go unsaved by leaving: save it on the way to another page, and ask before a reload or close.
	beforeNavigate(() => {
		if (working.saver.state === 'pending') void working.saver.flush();
	});
	$effect(() => {
		if (!working.saver.unsaved) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		addEventListener('beforeunload', warn);
		return () => removeEventListener('beforeunload', warn);
	});

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
	// Moving mode: a drag anywhere on the canvas moves the selected node. It is how a finger moves a node (a mouse
	// can drag one directly), chosen from the node menu, and ends with the selection.
	let moving = $state(false);
	function select(id: string | null) {
		if (id !== selected) moving = false;
		selected = id;
	}
	// Enter on the selected node asks for the details: on a phone they are out of sight, so that brings the sheet
	// up; on a wide screen they are already beside the canvas.
	function details(id: string) {
		selected = id;
		if (narrow) sheet = 'details';
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
		{#if !mine}Owned by {data.diagram.ownerEmail} · read-only · {/if}Updated {ago(data.diagram.updatedAt, now)}
	</span>
	{#if mine}
		<span class="save" data-testid="save-status" aria-live="polite">
			{#if working.saver.state === 'pending' || working.saver.state === 'saving'}
				Saving…
			{:else if working.saver.state === 'error'}
				Couldn't save. <button type="button" class="link" onclick={() => working.saver.flush()}>Try again</button>
			{:else if working.saver.state === 'conflict'}
				This diagram changed somewhere else. <button type="button" class="link" onclick={() => invalidateAll()}>Load the latest</button>
			{:else if replayed}
				Replaying history: go back to the working copy to move nodes
			{:else if moving && selectedNode}
				Drag anywhere to move “{selectedNode.name}” · two fingers pan
			{:else}
				Saved · {narrow ? 'tap a node to move it' : 'drag a node to move it'}
			{/if}
		</span>
	{/if}
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
		<DiagramCanvas {scene} {on} {selected} onselect={select} ondetails={details} {editable} moving={moving && editable} onmove={moveNode} />
	</main>
	{#if !narrow}
		<aside class="right">
			{#if selectedNode}<Inspector node={selectedNode} tags={tagByKey} />{/if}
			{@render history()}
		</aside>
	{/if}
</div>

{#if narrow}
	{#if selectedNode}
		<!-- The node menu takes the toolbar's place while a node is selected. -->
		<nav class="toolbar node-menu" aria-label="Selected node" data-testid="node-menu">
			<button type="button" class:active={moving} aria-pressed={moving} disabled={!editable} title={editable ? '' : replayed ? 'Go back to the working copy to move nodes' : 'Only the owner can move nodes'} onclick={() => (moving = !moving)}>
				<span class="t-label">{moving ? 'Moving' : 'Move'}</span><span class="t-value">{moving ? 'Drag anywhere · tap to stop' : selectedNode.name}</span>
			</button>
			<button type="button" onclick={() => (sheet = 'details')}>
				<span class="t-label">Details</span><span class="t-value">{selectedNode.type}</span>
			</button>
			<button type="button" class="done" aria-label="Done with {selectedNode.name}" onclick={() => select(null)}>
				<span class="t-label">Done</span><span class="t-value">×</span>
			</button>
		</nav>
	{:else}
		<nav class="toolbar" aria-label="Diagram panels">
			<button type="button" onclick={() => (sheet = 'views')}>
				<span class="t-label">View</span><span class="t-value">{view ?? (scene.views.length ? 'Everything' : 'Tags')}</span>
			</button>
			<button type="button" onclick={() => (sheet = 'history')}>
				<span class="t-label">History</span><span class="t-value">{replayed ? replayed.label : `${data.snapshots.length} ${data.snapshots.length === 1 ? 'snapshot' : 'snapshots'}`}</span>
			</button>
			<button type="button" disabled>
				<span class="t-label">Node</span><span class="t-value">Tap one</span>
			</button>
		</nav>
	{/if}
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
	.save {
		margin-left: auto;
		color: var(--color-neutral-500);
	}
	.link {
		font: inherit;
		padding: 0;
		border: none;
		background: none;
		color: var(--color-accent);
		text-decoration: underline;
		cursor: pointer;
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
	.node-menu {
		border-top-color: var(--color-accent-700);
	}
	.node-menu button.active {
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
		color: var(--color-accent-200);
	}
	.node-menu button.active .t-label {
		color: var(--color-accent-300);
	}
	.node-menu .done {
		flex: 0 0 72px;
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
