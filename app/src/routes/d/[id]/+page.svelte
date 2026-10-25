<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createApi } from '#lib/api.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DiagramCanvas from '#lib/components/DiagramCanvas.svelte';
	import HistoryPanel from '#lib/components/HistoryPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import BoxInspector from '#lib/components/BoxInspector.svelte';
	import EdgeInspector from '#lib/components/EdgeInspector.svelte';
	import Inspector from '#lib/components/Inspector.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import TagPanel from '#lib/components/TagPanel.svelte';
	import TypePicker from '#lib/components/TypePicker.svelte';
	import {
		addBoundary,
		addEdge,
		addNode,
		connectToNew,
		duplicateBoundary,
		duplicateNode,
		moveBoundary,
		removeBoundary,
		removeEdge,
		removeNode,
		resizeBoundary,
		reverseEdge,
		updateBoundary,
		updateEdge,
		updateNode,
		type BoundaryChange,
		type EdgeChange,
		type NodeChange
	} from '#lib/diagram/edit.ts';
	import { History } from '#lib/history.svelte.ts';
	import { tagsOn, toScene } from '#lib/diagram/model.ts';
	import { followState } from '#lib/follow.ts';
	import { Saver } from '#lib/saver.svelte.ts';
	import type { Diagram, SkopeDoc } from '#lib/types.ts';
	import { ago } from '#lib/time.ts';

	let { data } = $props();

	const workspace = $derived(data.workspaces.find(w => w.id === data.diagram.workspaceId));
	const api = createApi(fetch);

	// The working copy as edited here, what saves it, and its undo history. All start over whenever a diagram
	// (re)loads.
	const start = (d: Diagram) => ({
		doc: structuredClone(d.doc),
		saver: new Saver((rev, doc) => api.save(d.id, { rev, doc }), d.rev),
		history: new History()
	});
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
	// A connection is selected by its place in the document; a node and a connection are never both selected.
	let selectedEdge = $state<number | null>(null);
	// A connection being made from this node; the next node tapped is its other end.
	let connectFrom = $state<string | null>(null);
	// The selected container, and on a phone whether a drag moves or resizes it.
	let selectedBox = $state<string | null>(null);
	let boxMode = $state<'move' | 'resize' | null>(null);
	$effect.pre(() => {
		// A new diagram or snapshot starts from its own saved view. Moving a node changes the scene too, but keeps
		// the view, so this reads which document is shown, not the scene itself.
		void [replaying, working];
		untrack(() => {
			view = scene.initialView;
			on = tagsOn(scene, scene.initialView);
			selected = null;
			selectedEdge = null;
			connectFrom = null;
			selectedBox = null;
			boxMode = null;
		});
	});

	const tagByKey = $derived(Object.fromEntries(scene.tags.map(t => [t.key, t])));
	const selectedNode = $derived(selected ? scene.nodes.find(n => n.id === selected) : undefined);
	const selectedBoxScene = $derived(selectedBox ? scene.boundaries.find(b => b.id === selectedBox) : undefined);
	const selectedEdgeScene = $derived(selectedEdge === null ? undefined : scene.edges[selectedEdge]);
	// What a connection's end is called: a node's name, or a container's label.
	const nameOf = (id: string) => scene.nodes.find(n => n.id === id)?.name ?? scene.boundaries.find(b => b.id === id)?.label ?? id;
	const connections = $derived(
		selected
			? scene.edges
					.filter(e => e.from === selected || e.to === selected)
					.map(e => ({ index: e.index, out: e.from === selected, name: nameOf(e.from === selected ? e.to : e.from), label: e.label }))
			: []
	);

	const follow = $derived(followState(data.diagram, data.lead));
	const mine = $derived(data.diagram.ownerEmail === data.me.email);
	const now = Date.now();

	// Nodes can be edited on your own diagram, and not while replaying history.
	const editable = $derived(mine && !replayed && working.saver.state !== 'conflict');
	// What a mode in progress asks of you. Wide screens show it in the strip; a phone floats it over the canvas,
	// so it never wraps the strip (and moves everything below) as it comes and goes.
	const modeHint = $derived.by(() => {
		if (!mine || replayed || working.saver.state === 'conflict' || working.saver.state === 'error') return '';
		if (connectFrom) return `${narrow ? 'Tap' : 'Click'} the node to connect “${nameOf(connectFrom)}” to · ${narrow ? 'tap empty space' : 'Esc'} to cancel`;
		if (boxMode && selectedBoxScene) return `Drag anywhere to ${boxMode} “${selectedBoxScene.label || 'the container'}” · two fingers pan`;
		if (moving && selectedNode) return `Drag anywhere to move “${selectedNode.name}” · two fingers pan`;
		return '';
	});

	// Every edit goes through here: the document as it was goes on the undo history, the new one is shown and saved.
	const current = () => $state.snapshot(working.doc) as SkopeDoc;
	function apply(next: SkopeDoc, before: SkopeDoc, label: string, group?: string) {
		if (!editable) return;
		working.history.record(before, label, group);
		show(next);
	}
	function show(doc: SkopeDoc) {
		canvasRef?.hold();
		working.doc = doc;
		working.saver.queue(doc);
		if (selected && !doc.nodes?.some(n => n.id === selected)) select(null);
		if (selectedEdge !== null && selectedEdge >= (doc.edges?.length ?? 0)) selectedEdge = null;
		if (selectedBox && !doc.boundaries?.some(b => b.id === selectedBox)) selectBox(null);
	}
	function undo() {
		const doc = editable && working.history.undo(current());
		if (doc) show(doc);
	}
	function redo() {
		const doc = editable && working.history.redo(current());
		if (doc) show(doc);
	}
	function moveNode(id: string, x: number, y: number) {
		const before = current();
		const next = { ...before, nodes: before.nodes?.map(n => (n.id === id ? { ...n, layout: { ...(n.layout ?? { x, y }), x, y } } : n)) };
		apply(next, before, 'Move node');
	}
	function changeNode(change: NodeChange, label: string, group?: string) {
		if (!selected) return;
		const before = current();
		apply(updateNode(before, selected, change), before, label, group);
	}

	let canvasRef = $state<ReturnType<typeof DiagramCanvas>>();
	let adding = $state(false);
	function add(type: string) {
		adding = false;
		sheet = null;
		const before = current();
		const made = addNode(before, type, canvasRef?.center() ?? { x: 400, y: 300 });
		apply(made.doc, before, `Add ${type.toLowerCase()}`);
		select(made.id);
	}
	function duplicate() {
		if (!selected) return;
		const before = current();
		const made = duplicateNode(before, selected);
		if (!made) return;
		apply(made.doc, before, 'Duplicate node');
		select(made.id);
	}
	function startConnect(from: string) {
		if (!editable) return;
		moving = false;
		connectFrom = from;
	}
	function connect(from: string, to: string | null, at: { x: number; y: number }) {
		connectFrom = null;
		if (to === from) return;
		const before = current();
		if (to) {
			const made = addEdge(before, from, to);
			apply(made.doc, before, `Connect ${nameOf(from)} → ${nameOf(to)}`);
			selectEdge(made.index);
		} else {
			// Dropped on empty canvas: a new node there, connected, as in the prototype.
			const made = connectToNew(before, from, 'Service', at);
			apply(made.doc, before, `Connect ${nameOf(from)} to a new service`);
			select(made.id);
		}
	}
	function changeEdge(change: EdgeChange, label: string, group?: string) {
		if (selectedEdge === null) return;
		const before = current();
		apply(updateEdge(before, selectedEdge, change), before, label, group);
	}
	function reverse() {
		if (selectedEdge === null) return;
		const before = current();
		apply(reverseEdge(before, selectedEdge), before, 'Reverse connection');
	}
	function disconnect() {
		if (selectedEdge === null) return;
		const before = current();
		const at = selectedEdge;
		sheet = null;
		selectedEdge = null;
		apply(removeEdge(before, at), before, 'Delete connection');
	}
	function addBox() {
		adding = false;
		sheet = null;
		const before = current();
		const made = addBoundary(before, canvasRef?.center() ?? { x: 400, y: 300 });
		apply(made.doc, before, 'Add container');
		selectBox(made.id);
	}
	const moveBox = (id: string, x: number, y: number) => {
		const before = current();
		apply(moveBoundary(before, id, x, y), before, 'Move container');
	};
	const resizeBox = (id: string, w: number, h: number) => {
		const before = current();
		apply(resizeBoundary(before, id, w, h), before, 'Resize container');
	};
	function changeBox(change: BoundaryChange, label: string, group?: string) {
		if (!selectedBox) return;
		const before = current();
		apply(updateBoundary(before, selectedBox, change), before, label, group);
	}
	function duplicateBox() {
		if (!selectedBox) return;
		const before = current();
		const made = duplicateBoundary(before, selectedBox);
		if (!made) return;
		apply(made.doc, before, 'Duplicate container');
		selectBox(made.id);
	}
	function removeBox() {
		if (!selectedBox) return;
		const before = current();
		const id = selectedBox;
		sheet = null;
		selectBox(null);
		apply(removeBoundary(before, id), before, 'Delete container');
	}
	function remove() {
		if (!selected) return;
		const before = current();
		const name = selectedNode?.name ?? 'node';
		sheet = null;
		apply(removeNode(before, selected), before, `Delete “${name}”`);
	}

	// The prototype's shortcuts, away from text fields: ⌘Z / ⇧⌘Z (or ctrl+Y) undo and redo, ⌘D duplicates, and
	// Delete or Backspace removes the selected node.
	function shortcut(e: KeyboardEvent) {
		if (!editable || e.defaultPrevented || (e.target as Element).closest?.('input, textarea, select, [contenteditable]')) return;
		const meta = e.metaKey || e.ctrlKey;
		const k = e.key.toLowerCase();
		if (meta && k === 'z') e.shiftKey ? redo() : undo();
		else if (meta && k === 'y') redo();
		else if (meta && k === 'd' && selected) duplicate();
		else if (meta && k === 'd' && selectedBox) duplicateBox();
		else if ((k === 'delete' || k === 'backspace') && selected && !meta) remove();
		else if ((k === 'delete' || k === 'backspace') && selectedEdge !== null && !meta) disconnect();
		else if ((k === 'delete' || k === 'backspace') && selectedBox && !meta) removeBox();
		else if (k === 'escape' && connectFrom) connectFrom = null;
		else if (k === 'escape' && adding) adding = false;
		else return;
		e.preventDefault();
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
	let sheet = $state<'views' | 'history' | 'details' | 'add' | 'edge' | 'box' | null>(null);
	// Moving mode: a drag anywhere on the canvas moves the selected node. It is how a finger moves a node (a mouse
	// can drag one directly), chosen from the node menu, and ends with the selection.
	let moving = $state(false);
	function select(id: string | null) {
		if (id !== selected) moving = false;
		selected = id;
		selectedEdge = null;
		connectFrom = null;
		selectedBox = null;
		boxMode = null;
	}
	function selectEdge(index: number) {
		select(null);
		selectedEdge = index;
	}
	function selectBox(id: string | null) {
		if (id !== selectedBox) boxMode = null;
		const keep = boxMode;
		select(null);
		selectedBox = id;
		boxMode = keep;
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
<svelte:window
	onkeydown={shortcut}
	onpointerdown={e => {
		// The add menu closes on a press anywhere outside it (its own button toggles it).
		if (adding && !(e.target as Element).closest('.add-menu, .tool.add')) adding = false;
	}}
/>

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
				Couldn't save · <button type="button" class="link" onclick={() => working.saver.flush()}>Try again</button>
			{:else if working.saver.state === 'conflict'}
				{narrow ? 'Changed elsewhere' : 'This diagram changed somewhere else'} · <button type="button" class="link" onclick={() => invalidateAll()}>Load the latest</button>
			{:else if replayed}
				{narrow ? 'Replaying' : 'Replaying history: go back to the working copy to edit'}
			{:else if modeHint && !narrow}
				{modeHint}
			{:else}
				Saved{working.history.undoLabel || narrow ? '' : ' · drag a node to move it, click one to edit it'}
			{/if}
		</span>
	{/if}
	{#if follow.kind === 'following'}
		<span class="follow" data-testid="follow">
			<Icon name="follow" size={12} />
			Follows <a href={resolve('/d/[id]', { id: follow.leadId })}>{follow.leadName}</a>
			{#if !narrow}· {follow.syncedLabel ? `synced to “${follow.syncedLabel}”` : 'not synced yet'}{/if}
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

{#snippet nodeInspector()}
	{#if selectedNode}
		<Inspector
			node={selectedNode}
			tags={tagByKey}
			{editable}
			onchange={changeNode}
			onfieldend={() => working.history.endGroup()}
			ondelete={remove}
			onduplicate={duplicate}
			{connections}
			onpickedge={i => {
				selectEdge(i);
				if (narrow) sheet = 'edge';
			}}
		/>
	{/if}
{/snippet}
{#snippet addChoices(focus: boolean)}
	<button type="button" class="add-box" onclick={addBox}><Icon name="frameCorners" size={15} />Container<span>a labelled box to group nodes</span></button>
	<TypePicker autofocus={focus} onpick={add} />
{/snippet}
{#snippet boxInspector()}
	{#if selectedBoxScene}
		<BoxInspector box={selectedBoxScene} {editable} onchange={changeBox} onfieldend={() => working.history.endGroup()} onduplicate={duplicateBox} ondelete={removeBox} />
	{/if}
{/snippet}
{#snippet edgeInspector()}
	{#if selectedEdgeScene}
		<EdgeInspector
			edge={selectedEdgeScene}
			fromName={nameOf(selectedEdgeScene.from)}
			toName={nameOf(selectedEdgeScene.to)}
			{editable}
			onchange={changeEdge}
			onfieldend={() => working.history.endGroup()}
			onreverse={reverse}
			ondelete={disconnect}
		/>
	{/if}
{/snippet}
{#snippet tags()}
	<TagPanel {scene} {on} {view} onview={setView} ontoggle={toggleTag} />
{/snippet}
{#snippet history()}
	<HistoryPanel snapshots={data.snapshots} current={replaying} onpick={pick} {now} />
{/snippet}

<div class="body">
	{#if !narrow}{@render tags()}{/if}
	<main class="stage" aria-label="Diagram">
		<DiagramCanvas
			bind:this={canvasRef}
			{scene}
			{on}
			{selected}
			onselect={select}
			ondetails={details}
			{editable}
			moving={moving && editable}
			onmove={moveNode}
			{selectedEdge}
			onselectedge={selectEdge}
			{connectFrom}
			onconnect={connect}
			onconnectstart={startConnect}
			{selectedBox}
			onselectbox={selectBox}
			onmovebox={moveBox}
			onresizebox={resizeBox}
			boxMode={editable ? boxMode : null}
		/>
		{#if narrow && modeHint}
			<p class="mode-hint" data-testid="mode-hint">{modeHint}</p>
		{/if}
		{#if editable}
			<div class="tools" role="toolbar" aria-label="Edit">
				<button type="button" class="tool add" aria-expanded={narrow ? sheet === 'add' : adding} onclick={() => (narrow ? (sheet = 'add') : (adding = !adding))}>
					<span aria-hidden="true">+</span> Add
				</button>
				<button type="button" class="tool" aria-label={working.history.undoLabel ? `Undo ${working.history.undoLabel}` : 'Nothing to undo'} title={working.history.undoLabel ? `Undo: ${working.history.undoLabel}` : 'Nothing to undo'} disabled={!working.history.undoLabel} onclick={undo}>
					<Icon name="arrowCCW" size={15} />
				</button>
				<button type="button" class="tool" aria-label={working.history.redoLabel ? `Redo ${working.history.redoLabel}` : 'Nothing to redo'} title={working.history.redoLabel ? `Redo: ${working.history.redoLabel}` : 'Nothing to redo'} disabled={!working.history.redoLabel} onclick={redo}>
					<Icon name="arrowCW" size={15} />
				</button>
			</div>
			{#if adding && !narrow}
				<div class="add-menu" role="dialog" aria-label="Add a node">
					{@render addChoices(true)}
				</div>
			{/if}
		{/if}
	</main>
	{#if !narrow}
		<aside class="right">
			{@render nodeInspector()}
			{@render edgeInspector()}
			{@render boxInspector()}
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
			{#if editable}
				<button type="button" class:active={connectFrom === selectedNode.id} aria-pressed={connectFrom === selectedNode.id} onclick={() => (connectFrom ? (connectFrom = null) : startConnect(selectedNode.id))}>
					<span class="t-label">{connectFrom ? 'Connecting' : 'Connect'}</span><span class="t-value">{connectFrom ? 'Tap a node · tap to stop' : 'to a node'}</span>
				</button>
			{/if}
			<button type="button" onclick={() => (sheet = 'details')}>
				<span class="t-label">{editable ? 'Edit' : 'Details'}</span><span class="t-value">{selectedNode.type}</span>
			</button>
			<button type="button" class="done" aria-label="Done with {selectedNode.name}" onclick={() => select(null)}>
				<span class="t-label">Done</span><span class="t-value">×</span>
			</button>
		</nav>
	{:else if selectedBoxScene}
		<!-- A selected container: a finger moves or resizes it from anywhere once one is chosen. -->
		<nav class="toolbar node-menu" aria-label="Selected container" data-testid="box-menu">
			{#if editable}
				{#each [['move', 'Move', 'Moving'], ['resize', 'Resize', 'Resizing']] as const as [mode, label, active] (mode)}
					<button type="button" class:active={boxMode === mode} aria-pressed={boxMode === mode} onclick={() => (boxMode = boxMode === mode ? null : mode)}>
						<span class="t-label">{boxMode === mode ? active : label}</span><span class="t-value">{boxMode === mode ? 'Drag anywhere' : selectedBoxScene.label || 'Container'}</span>
					</button>
				{/each}
			{/if}
			<button type="button" onclick={() => (sheet = 'box')}>
				<span class="t-label">{editable ? 'Edit' : 'Details'}</span><span class="t-value">Container</span>
			</button>
			<button type="button" class="done" aria-label="Done with the container" onclick={() => selectBox(null)}>
				<span class="t-label">Done</span><span class="t-value">×</span>
			</button>
		</nav>
	{:else if selectedEdgeScene}
		<!-- A selected connection gets its own menu. -->
		<nav class="toolbar node-menu" aria-label="Selected connection" data-testid="edge-menu">
			<button type="button" onclick={() => (sheet = 'edge')}>
				<span class="t-label">{editable ? 'Edit connection' : 'Connection'}</span><span class="t-value">{nameOf(selectedEdgeScene.from)} → {nameOf(selectedEdgeScene.to)}</span>
			</button>
			{#if editable}
				<button type="button" class="narrow-btn" onclick={disconnect}>
					<span class="t-label">Delete</span><span class="t-value">Connection</span>
				</button>
			{/if}
			<button type="button" class="done" aria-label="Done with the connection" onclick={() => (selectedEdge = null)}>
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
	<Sheet open={sheet === 'add'} title="Add a node" onclose={() => (sheet = null)}>
		<div class="add-sheet">{@render addChoices(false)}</div>
	</Sheet>
	<Sheet open={sheet === 'details' && !!selectedNode} title="Node details" onclose={() => (sheet = null)}>
		{@render nodeInspector()}
	</Sheet>
	<Sheet open={sheet === 'box' && !!selectedBoxScene} title="Container" onclose={() => (sheet = null)}>
		{@render boxInspector()}
	</Sheet>
	<Sheet open={sheet === 'edge' && !!selectedEdgeScene} title="Connection" onclose={() => (sheet = null)}>
		{@render edgeInspector()}
	</Sheet>
{/if}

<style>
	/* One line, always: its pieces shorten with an ellipsis rather than wrap, so the canvas below never moves as
	   the save status changes. */
	.strip {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: nowrap;
		white-space: nowrap;
		overflow: hidden;
		min-height: 18px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--color-divider);
		font-size: 12px;
		color: var(--color-neutral-500);
	}
	.meta,
	.follow,
	.save {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* When space runs out, "Updated…" gives way first and the save status never does. */
	.meta {
		flex: 0 3 auto;
	}
	.follow {
		flex: 0 1 auto;
		color: var(--color-accent-300);
	}
	.follow :global(svg) {
		vertical-align: -2px;
	}
	.follow.gone {
		color: var(--color-neutral-500);
	}
	.save {
		flex: none;
		margin-left: auto;
		color: var(--color-neutral-500);
	}
	.mode-hint {
		position: absolute;
		top: 60px;
		left: 50%;
		transform: translateX(-50%);
		max-width: calc(100% - 24px);
		box-sizing: border-box;
		margin: 0;
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid var(--color-accent-700);
		background: color-mix(in srgb, var(--color-surface) 94%, transparent);
		color: var(--color-accent-200);
		font-size: 12.5px;
		text-align: center;
		pointer-events: none;
		z-index: 1;
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
	.tools {
		position: absolute;
		top: 10px;
		left: 10px;
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 10px;
		border: 1px solid var(--color-divider);
		background: color-mix(in srgb, var(--color-surface) 92%, transparent);
		box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.3));
	}
	.tool {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		min-width: 38px;
		height: 38px;
		padding: 0 10px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-neutral-300);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.tool:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.tool:disabled {
		color: var(--color-neutral-700);
		cursor: default;
	}
	.tool.add {
		color: var(--color-accent);
	}
	.tool.add span {
		font-size: 17px;
		line-height: 1;
	}
	.add-menu {
		position: absolute;
		top: 58px;
		left: 10px;
		width: min(340px, calc(100% - 20px));
		max-height: calc(100% - 70px);
		overflow-y: auto;
		box-sizing: border-box;
		padding: 10px;
		border-radius: 10px;
		border: 1px solid var(--color-divider);
		background: var(--color-surface);
		box-shadow: var(--shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.4));
		z-index: 2;
	}
	.add-box {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
		padding: 8px 10px;
		min-height: 40px;
		border-radius: 8px;
		border: 1px dashed var(--color-neutral-700);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}
	.add-box :global(svg) {
		color: var(--color-accent);
	}
	.add-box span {
		margin-left: auto;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.add-box:hover {
		border-color: var(--color-accent-700);
	}
	.add-sheet {
		padding: 10px 16px 16px;
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
	.node-menu .narrow-btn {
		flex: 0 0 100px;
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
