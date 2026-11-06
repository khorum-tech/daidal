<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto, invalidateAll, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NodeTip from '#lib/components/NodeTip.svelte';
	import TourCallout from '#lib/components/TourCallout.svelte';
	import { saveTour, TOUR, tourCounts, tourOf, type TourCounts, type TourState } from '#lib/tour.ts';
	import { exportName, toSvg } from '#lib/diagram/render.ts';
	import { download, svgToPng } from '#lib/download.ts';
	import ConfigPanel from '#lib/components/ConfigPanel.svelte';
	import type { ConfigLang } from '#lib/diagram/config.ts';
	import { createApi } from '#lib/api.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import DiagramCanvas from '#lib/components/DiagramCanvas.svelte';
	import HistoryPanel from '#lib/components/HistoryPanel.svelte';
	import EditList from '#lib/components/EditList.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import BoxInspector from '#lib/components/BoxInspector.svelte';
	import DiagramSheet from '#lib/components/DiagramSheet.svelte';
	import EdgeInspector from '#lib/components/EdgeInspector.svelte';
	import Inspector from '#lib/components/Inspector.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import TagManager from '#lib/components/TagManager.svelte';
	import TagPanel from '#lib/components/TagPanel.svelte';
	import TypePicker from '#lib/components/TypePicker.svelte';
	import {
		addBoundary,
		addEdge,
		addNode,
		addTag,
		addView,
		clipCentre,
		lockView,
		connectToNew,
		copyNodes,
		duplicateBoundary,
		duplicateNode,
		moveBoundary,
		moveNodes,
		pasteNodes,
		removeBoundary,
		removeEdge,
		removeMany,
		removeNode,
		removeTag,
		removeView,
		resizeBoundary,
		resizeNode,
		reverseEdge,
		setDefaultView,
		toggleTagOn,
		updateBoundary,
		updateEdge,
		setEnd,
		paletteById,
		paletteOf,
		recolourTags,
		type PaletteId,
		updateEdges,
		updateNode,
		updateNodes,
		updateTag,
		updateView,
		viewNameFree,
		type BoundaryChange,
		type EdgeChange,
		type NodeChange,
		type Picked
	} from '#lib/diagram/edit.ts';
	import { getClip, putClip } from '#lib/clipboard.ts';
	import MultiInspector from '#lib/components/MultiInspector.svelte';
	import { History } from '#lib/history.svelte.ts';
	import { iconScene, tagsOn, toScene, type Anchor } from '#lib/diagram/model.ts';
	import { catalogue } from '#lib/diagram/icons.ts';
	import { kindOf, type KindId } from '#lib/diagram/kinds.ts';
	import { appearance } from '#lib/appearance.svelte.ts';
	import { distinguishable } from '#lib/diagram/colour.ts';
	import { followState } from '#lib/follow.ts';
	import { applyChange, pending, withNeeded, type Change } from '#lib/diagram/review.ts';
	import FollowPanel from '#lib/components/FollowPanel.svelte';
	import { Saver } from '#lib/saver.svelte.ts';
	import type { Diagram, SkopeDoc, Snapshot } from '#lib/types.ts';
	import { ago } from '#lib/time.ts';

	let { data } = $props();

	const workspace = $derived(data.workspaces.find(w => w.id === data.diagram.workspaceId));
	const api = createApi(fetch);

	// The working copy as edited here, what saves it, and its undo history. All start over whenever a diagram
	// (re)loads.
	// The name rides along with every save, so a rename has the same conflict check as an edit.
	interface Working {
		doc: SkopeDoc;
		name: string;
		saver: Saver;
		history: History;
		snapshots: Snapshot[];
		/** What it follows and how far it has reviewed; saved with the document. Unlinking sets lead to null. */
		follow: { lead: string | null; synced: string | null; decided: Record<string, string>; paused: boolean };
	}
	const start = (d: Diagram): Working => ({
		doc: structuredClone(d.doc),
		name: d.name,
		saver: new Saver((rev, doc) => api.save(d.id, { rev, doc, name: working.name, ...followFields(d) }), d.rev),
		follow: { lead: d.leadId, synced: d.syncedSnapshotId, decided: { ...d.decided }, paused: d.paused },
		history: new History(),
		// Snapshots taken here join the history straight away.
		snapshots: d.id === data.diagram.id ? [...data.snapshots] : []
	});
	let loaded = untrack(() => data.diagram);
	let working = $state<Working>(start(loaded));
	// The snapshot being replayed, or null for the working copy.
	let replaying = $state<string | null>(null);
	$effect.pre(() => {
		if (data.diagram === loaded) return;
		loaded = data.diagram;
		working = start(loaded);
		replaying = null;
	});
	const replayed = $derived(replaying ? working.snapshots.find(s => s.id === replaying) : undefined);
	// The workspace's own types, merged into the built-in ones, name and draw the nodes.
	const cats = $derived(catalogue(workspace?.types ?? []));
	const kind = $derived(kindOf(working.doc.diagram?.kind));
	const scene = $derived(toScene(replayed?.doc ?? working.doc, cats));

	// View and tag switches are only what this browser shows; nothing is saved.
	let view = $state<string | null>(null);
	let on = $state<Record<string, boolean>>({});
	// A tag shown alone, and the switches to go back to when it stops.
	let solo = $state<string | null>(null);
	let beforeSolo: Record<string, boolean> | null = null;
	let selected = $state<string | null>(null);
	// A connection is selected by its place in the document; a node and a connection are never both selected.
	let selectedEdge = $state<number | null>(null);
	// A connection being made from this node; the next node tapped is its other end.
	let connectFrom = $state<string | null>(null);
	// The selected container, and on a phone whether a drag moves or resizes it.
	let selectedBox = $state<string | null>(null);
	let boxMode = $state<'move' | 'resize' | null>(null);
	// The toolbar's Connect: the next node clicked is where a connection starts. It ends once one is made.
	let connectTool = $state(false);
	// The node whose name is being typed on the canvas.
	let renaming = $state<string | null>(null);
	// Many picked at once, and the toolbar's Multi-select (a phone's Select): taps pick, a drag draws a box.
	let multi = $state<Picked | null>(null);
	let manyMode = $state(false);
	// Editing locked on this device, and presenting (both read-only); see below.
	let locked = $state(false);
	let presenting = $state(false);
	$effect.pre(() => {
		// A new diagram or snapshot starts from its own saved view. Moving a node changes the scene too, but keeps
		// the view, so this reads which document is shown, not the scene itself.
		void [replaying, working];
		untrack(() => {
			// A link can open on a view (?view=Name); else the diagram's own.
			const asked = replaying ? null : page.url.searchParams.get('view');
			view = scene.views.some(v => v.label === asked) ? asked : scene.initialView;
			on = tagsOn(scene, view);
			solo = null;
			selected = null;
			selectedEdge = null;
			connectFrom = null;
			selectedBox = null;
			boxMode = null;
			connectTool = false;
			renaming = null;
			multi = null;
			manyMode = false;
		});
	});

	const tagByKey = $derived(Object.fromEntries(scene.tags.map(t => [t.key, t])));
	const selectedNode = $derived(selected ? scene.nodes.find(n => n.id === selected) : undefined);
	const selectedBoxScene = $derived(selectedBox ? scene.boundaries.find(b => b.id === selectedBox) : undefined);
	const selectedEdgeScene = $derived(selectedEdge === null ? undefined : scene.edges[selectedEdge]);
	const multiNodes = $derived(multi ? scene.nodes.filter(n => multi!.nodes.includes(n.id)) : []);
	const multiEdges = $derived(multi ? scene.edges.filter(e => multi!.edges.includes(e.index)) : []);
	// What a connection's end is called: a node's name, or a container's label.
	const nameOf = (id: string) => scene.nodes.find(n => n.id === id)?.name ?? scene.boundaries.find(b => b.id === id)?.label ?? id;
	const connections = $derived(
		selected
			? scene.edges
					.filter(e => e.from === selected || e.to === selected)
					.map(e => ({ index: e.index, out: e.from === selected, name: nameOf(e.from === selected ? e.to : e.from), label: e.label }))
			: []
	);

	// Where it stands against its lead, as reviewed here: verdicts, pause and sync save with the document.
	const follow = $derived(
		followState({ ...data.diagram, leadId: working.follow.lead, syncedSnapshotId: working.follow.synced, paused: working.follow.paused }, data.lead)
	);
	const updates = $derived(follow.kind === 'following' && data.lead ? pending(data.lead.snapshots, working.follow.synced) : []);
	const openUpdates = $derived(updates.flatMap(g => g.changes).filter(c => !working.follow.decided[c.id]).length);
	/** The follow fields a save carries: none for a diagram that never followed, and leadId null once unlinked. */
	function followFields(d: Diagram) {
		if (!d.leadId) return {};
		const f = working.follow;
		return f.lead ? { syncedSnapshotId: f.synced, decided: f.decided, paused: f.paused } : { leadId: null };
	}
	function saveFollow() {
		if (mine) working.saver.queue(current());
	}
	function acceptChanges(chosen: Change[], label: string) {
		if (!editable) return;
		const before = current();
		const changes = withNeeded(before, chosen, updates.flatMap(g => g.changes));
		apply(
			changes.reduce((d, c) => applyChange(d, c), before),
			before,
			label
		);
		working.follow.decided = { ...working.follow.decided, ...Object.fromEntries(changes.map(c => [c.id, 'accepted'])) };
	}
	function skipChanges(ids: string[]) {
		working.follow.decided = { ...working.follow.decided, ...Object.fromEntries(ids.map(id => [id, 'skipped'])) };
		saveFollow();
	}
	function undecide(id: string) {
		const rest = { ...working.follow.decided };
		delete rest[id];
		working.follow.decided = rest;
		saveFollow();
	}
	function pauseFollow(paused: boolean) {
		working.follow.paused = paused;
		saveFollow();
		notify(paused ? 'Paused: updates stay out of the way' : `Following ${data.lead?.name ?? 'the lead'} again`);
	}
	function markReviewed() {
		const last = data.lead?.snapshots.at(-1);
		if (!last) return;
		working.follow.synced = last.id;
		saveFollow();
		notify(`Caught up with ${data.lead?.name}`);
	}
	function unlink() {
		working.follow = { lead: null, synced: null, decided: {}, paused: false };
		sheet = null;
		saveFollow();
		notify(`Unlinked from ${data.lead?.name ?? 'the lead'}`);
	}
	const mine = $derived(data.diagram.ownerEmail === data.me.email);
	const now = Date.now();

	// Nodes can be edited on your own diagram, and not while replaying history.
	const editable = $derived(mine && !replayed && working.saver.state !== 'conflict' && !locked && !presenting);
	// What a mode in progress asks of you. Wide screens show it in the strip; a phone floats it over the canvas,
	// so it never wraps the strip (and moves everything below) as it comes and goes.
	const modeHint = $derived.by(() => {
		if (!mine || replayed || working.saver.state === 'conflict' || working.saver.state === 'error') return '';
		if (connectFrom) return `${narrow ? 'Tap' : 'Click'} the node to connect “${nameOf(connectFrom)}” to, or empty space for a new one · ${narrow ? 'Connecting' : 'Esc'} to cancel`;
		if (connectTool) return 'Click the node to connect from · Esc to cancel';
		if (moving && multiNodes.length) return `Drag anywhere to move ${plural(multiNodes.length, 'node')} · two fingers pan`;
		if (manyMode) return `${narrow ? 'Tap' : 'Click'} to pick, or drag a box · ${narrow ? 'Done' : 'Esc'} to stop`;
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
		if (renaming && !doc.nodes?.some(n => n.id === renaming)) renaming = null;
		if (multi) {
			const nodes = multi.nodes.filter(id => doc.nodes?.some(n => n.id === id));
			const edges = multi.edges.filter(i => i < (doc.edges?.length ?? 0));
			multi = nodes.length || edges.length || manyMode ? { nodes, edges } : null;
		}
	}
	function undo() {
		const doc = editable && working.history.undo(current());
		if (doc) show(doc);
	}
	function redo() {
		const doc = editable && working.history.redo(current());
		if (doc) show(doc);
	}
	function goToEdit(count: number) {
		const doc = editable && working.history.goTo(current(), count);
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
	// The prototype's one-click adds: the commonest types, each with its own icon.
	const QUICK_ADD: [string, string][] = [
		['Service', 'cube'],
		['Database', 'database'],
		['Queue', 'queue'],
		['Actor', 'user'],
		['Note', 'note'],
		['Text', 'textT']
	];
	let adding = $state(false);
	function add(type: string) {
		adding = false;
		sheet = null;
		const before = current();
		const made = addNode(before, type, canvasRef?.center() ?? { x: 400, y: 300 });
		apply(made.doc, before, `Add ${type.toLowerCase()}`);
		selectNew(made.id);
	}
	// A node just made on a phone starts in Move, so a drag places it straight away (a tap anywhere stops).
	function selectNew(id: string) {
		select(id);
		if (narrow) moving = true;
	}
	// ---- locked, presenting ----
	// Locking editing is this device's choice for this diagram, kept in the browser: nothing changes by mistake.
	const lockKey = () => `skope.locked.${data.diagram.id}`;
	$effect.pre(() => {
		const key = lockKey();
		untrack(() => {
			try {
				locked = localStorage.getItem(key) === '1';
			} catch {
				locked = false;
			}
		});
	});
	function setLock(value: boolean) {
		if (value) {
			select(null);
			stopPicking();
			stopConnecting();
		}
		locked = value;
		try {
			if (value) localStorage.setItem(lockKey(), '1');
			else localStorage.removeItem(lockKey());
		} catch {
			// Kept for this visit only.
		}
		notify(value ? 'Locked: selection and views still work' : 'Editing unlocked');
	}
	// Presenting: the canvas alone, full screen where the browser allows, read-only, with a node's detail on hover
	// (on a tap, on a phone). Escape, or leaving full screen, ends it.
	let wentFullscreen = false;
	let hover = $state<{ id: string; at: DOMRect } | null>(null);
	function present() {
		select(null);
		stopPicking();
		stopConnecting();
		sheet = null;
		adding = false;
		presenting = true;
		wentFullscreen = false;
		const root = document.documentElement;
		if (!narrow && root.requestFullscreen) {
			root.requestFullscreen().then(
				() => (wentFullscreen = true),
				() => {}
			);
		}
	}
	function exitPresent() {
		presenting = false;
		hover = null;
		select(null);
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	}
	$effect(() => {
		const left = () => {
			if (!document.fullscreenElement && wentFullscreen && presenting) {
				wentFullscreen = false;
				exitPresent();
			}
		};
		document.addEventListener('fullscreenchange', left);
		return () => document.removeEventListener('fullscreenchange', left);
	});
	// The node whose detail shows: the one under the mouse, or on a phone the one tapped.
	// Icon-only cards, a viewer setting, apply while presenting.
	const iconCards = $derived(presenting && appearance.iconCards);
	const tipNode = $derived(scene.nodes.find(n => n.id === (presenting && narrow ? selected : hover?.id)));
	// While editing, the same card shows on a mouse resting over a node a moment; a press anywhere puts it away.
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	function hovering(id: string | null, at: DOMRect | null) {
		clearTimeout(hoverTimer);
		if (!id || !at) hover = null;
		else if (presenting) hover = { id, at };
		else {
			hover = null;
			hoverTimer = setTimeout(() => (hover = { id, at }), 700);
		}
	}
	const tipEdges = $derived(
		tipNode
			? scene.edges
					.filter(e => e.from === tipNode.id || e.to === tipNode.id)
					.map(e => ({ out: e.from === tipNode.id, name: nameOf(e.from === tipNode.id ? e.to : e.from), label: e.label }))
			: []
	);
	let stageEl = $state<HTMLElement>();
	/** Beside the node, on whichever side has room, and kept inside the canvas. */
	const tipAt = $derived.by(() => {
		if (!hover || !stageEl) return { left: 0, top: 0 };
		const box = stageEl.getBoundingClientRect();
		const W = 286;
		let left = hover.at.right - box.left + 14;
		if (left + W > box.width - 8) left = hover.at.left - box.left - W - 14;
		const top = hover.at.top - box.top + hover.at.height / 2 - 90;
		return { left: Math.max(8, left), top: Math.max(8, Math.min(top, box.height - 240)) };
	});
	const shareLink = $derived(page.url.origin + page.url.pathname);
	// The config (the document as YAML or JSON): beside the canvas on a wide screen, a sheet on a phone.
	let configOpen = $state(false);
	function openConfig() {
		if (narrow) sheet = 'config';
		else {
			sheet = null;
			configOpen = true;
		}
	}
	function applyConfig(next: SkopeDoc, mode: 'replace' | 'merge', summary: string) {
		const before = current();
		apply(next, before, mode === 'replace' ? 'Replace from the config' : 'Merge in a config');
		notify(summary);
	}
	function downloadConfig(text: string, lang: ConfigLang) {
		const name = exportName(working.name, `skope.${lang}`);
		download(name, new Blob([text], { type: lang === 'json' ? 'application/json' : 'text/yaml' }));
		notify(`Downloaded ${name}`);
	}
	/** The diagram as it shows now, as an image file. */
	async function exportImage(format: 'png' | 'svg', ghosted: boolean) {
		const { svg, width, height } = toSvg(scene, { on, ghosted });
		const blob = format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await svgToPng(svg, width, height);
		const name = exportName(view ? `${working.name} ${view}` : working.name, format);
		download(name, blob);
		notify(`Downloaded ${name}`);
	}

	// ---- many at once ----
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	/** What is picked now: the many, or the one node or connection selected. */
	const pickNow = (): Picked => multi ?? { nodes: selected ? [selected] : [], edges: selectedEdge === null ? [] : [selectedEdge] };
	const pickLabel = (p: Picked) => [p.nodes.length ? plural(p.nodes.length, 'node') : '', p.edges.length ? plural(p.edges.length, 'connection') : ''].filter(Boolean).join(' + ');
	/** Picks these; just one (outside Multi-select) is an ordinary selection. */
	function setPick(p: Picked) {
		const nodes = [...new Set(p.nodes)];
		const edges = [...new Set(p.edges)];
		if (!manyMode && nodes.length + edges.length <= 1) {
			if (nodes.length) select(nodes[0]);
			else if (edges.length) selectEdge(edges[0]);
			else select(null);
			return;
		}
		const keepMoving = moving;
		select(null);
		moving = keepMoving && nodes.length > 0;
		multi = nodes.length || edges.length || manyMode ? { nodes, edges } : null;
	}
	function togglePick({ node, edge }: { node?: string; edge?: number }) {
		const p = pickNow();
		const flip = <T,>(list: T[], v: T | undefined) => (v === undefined ? list : list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
		setPick({ nodes: flip(p.nodes, node), edges: flip(p.edges, edge) });
	}
	function boxPick(p: Picked, add: boolean) {
		const was = pickNow();
		setPick(add ? { nodes: [...was.nodes, ...p.nodes], edges: [...was.edges, ...p.edges] } : p);
		if (!p.nodes.length && !p.edges.length) notify('Nothing in that box');
	}
	const pickAll = () => setPick({ nodes: scene.nodes.map(n => n.id), edges: [] });
	function stopPicking() {
		manyMode = false;
		multi = null;
		moving = false;
	}
	function removePicked() {
		const p = pickNow();
		if (!p.nodes.length && !p.edges.length) return;
		const before = current();
		sheet = null;
		multi = null;
		apply(removeMany(before, p), before, `Delete ${pickLabel(p)}`);
	}
	function typeMany(type: string) {
		if (!multi) return;
		const before = current();
		apply(updateNodes(before, multi.nodes, { type }), before, `Set ${plural(multi.nodes.length, 'node')} to ${type}`);
	}
	function tagMany(key: string) {
		if (!multi) return;
		const before = current();
		const name = scene.tags.find(t => t.key === key)?.label ?? key;
		apply(toggleTagOn(before, multi.nodes, key), before, `Tag ${plural(multi.nodes.length, 'node')} “${name}”`);
	}
	function edgesMany(change: EdgeChange, label: string) {
		if (!multi) return;
		const before = current();
		apply(updateEdges(before, multi.edges, change), before, label);
	}
	function moveMany(ids: string[], dx: number, dy: number) {
		const before = current();
		apply(moveNodes(before, ids, dx, dy), before, `Move ${plural(ids.length, 'node')}`);
	}

	// ⌘C, ⌘X and ⌘V: copied nodes keep the connections between them and the tags they use, and paste here (nudged
	// down and right) or into another diagram (around the middle of the view).
	let clipSize = $state(getClip()?.nodes.length ?? 0);
	function copyPicked(cut: boolean) {
		const p = pickNow();
		if (!p.nodes.length) return notify('Pick a node to copy');
		putClip(copyNodes(current(), p.nodes));
		clipSize = p.nodes.length;
		if (!cut) return notify(`Copied ${plural(p.nodes.length, 'node')}`);
		const before = current();
		multi = null;
		apply(removeMany(before, { nodes: p.nodes, edges: [] }), before, `Cut ${plural(p.nodes.length, 'node')}`);
	}
	function paste() {
		const clip = getClip();
		if (!clip) return notify('Nothing copied yet');
		const before = current();
		const here = clip.nodes.every(n => before.nodes?.some(o => o.id === n.id));
		const centre = canvasRef?.center() ?? { x: 400, y: 300 };
		const from = clipCentre(clip);
		const [dx, dy] = here ? [28, 28] : [centre.x - from.x, centre.y - from.y];
		const made = pasteNodes(before, clip, dx, dy);
		adding = false;
		sheet = null;
		apply(made.doc, before, `Paste ${plural(made.ids.length, 'node')}`);
		setPick({ nodes: made.ids, edges: [] });
	}
	function duplicatePicked() {
		if (!multi?.nodes.length) return;
		const before = current();
		const made = pasteNodes(before, copyNodes(before, multi.nodes), 28, 28);
		apply(made.doc, before, `Duplicate ${plural(made.ids.length, 'node')}`);
		setPick({ nodes: made.ids, edges: [] });
	}
	// A short note in the strip (over the canvas on a phone) for what has no other sign, like a copy.
	let flash = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function notify(text: string) {
		flash = text;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = ''), 2200);
	}

	function duplicate() {
		if (!selected) return;
		const before = current();
		const made = duplicateNode(before, selected);
		if (!made) return;
		apply(made.doc, before, 'Duplicate node');
		selectNew(made.id);
	}
	function startConnect(from: string) {
		if (!editable) return;
		moving = false;
		connectFrom = from;
	}
	function stopConnecting() {
		connectTool = false;
		connectFrom = null;
	}
	function toggleConnectTool() {
		if (connectTool || connectFrom) return stopConnecting();
		select(null);
		manyMode = false;
		connectTool = true;
	}
	function toggleManyMode() {
		stopConnecting();
		if (manyMode) return stopPicking();
		manyMode = true;
		// What is selected now starts the pick.
		setPick(pickNow());
	}
	function connect(from: string, to: string | null, at: { x: number; y: number }) {
		connectFrom = null;
		connectTool = false;
		if (to === from) return;
		const before = current();
		if (to) {
			const made = addEdge(before, from, to);
			apply(made.doc, before, `Connect ${nameOf(from)} → ${nameOf(to)}`);
			selectEdge(made.index);
		} else {
			// Dropped or tapped on empty canvas: a new node there, connected, as in the prototype.
			const made = connectToNew(before, from, 'Service', at);
			apply(made.doc, before, `Connect ${nameOf(from)} to a new service`);
			selectNew(made.id);
		}
	}
	function changeEdge(change: EdgeChange, label: string, group?: string) {
		if (selectedEdge === null) return;
		const before = current();
		apply(updateEdge(before, selectedEdge, change), before, label, group);
	}
	function switchPalette(id: PaletteId) {
		const p = paletteById(id);
		const before = current();
		apply(recolourTags(before, id, distinguishable([...p.colors], appearance.condition)), before, `Switch to the ${p.label} palette`);
	}
	async function moveTo(workspace: string) {
		await working.saver.flush();
		await api.moveDiagram(data.diagram.id, workspace);
		sheet = null;
		await invalidateAll();
		notify(`Moved to ${data.workspaces.find(w => w.id === workspace)?.name ?? 'the workspace'}`);
	}
		function setEdgeEnd(index: number, end: 'from' | 'to', at: Anchor | null) {
		const before = current();
		apply(setEnd(before, index, end, at), before, at ? 'Pin connection end' : 'Connection end back to auto');
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
	// The toolbar's one-click adds, and a double-click on empty canvas: that one names the node straight away.
	function addAt(at: { x: number; y: number }) {
		const before = current();
		const made = addNode(before, 'Service', at);
		apply(made.doc, before, 'Add service');
		select(made.id);
		renaming = made.id;
	}
	function startRename(id: string) {
		select(id);
		renaming = id;
	}
	function renameNode(id: string, name: string | null) {
		renaming = null;
		const node = current().nodes?.find(n => n.id === id);
		if (!node || !name || name === node.name) return;
		const before = current();
		apply(updateNode(before, id, { name }), before, `Rename “${node.name}”`);
	}
	function resize(id: string, w: number, h: number) {
		const before = current();
		apply(resizeNode(before, id, w, h), before, `Resize “${nameOf(id)}”`);
	}
	// Snapping is how this browser drags nodes, not part of the diagram.
	const SNAP_KEY = 'skope.snap';
	let snap = $state(true);
	try {
		snap = localStorage.getItem(SNAP_KEY) !== 'off';
	} catch {
		// Storage can be blocked; snapping then starts on.
	}
	function setSnap(value: boolean) {
		snap = value;
		try {
			localStorage.setItem(SNAP_KEY, value ? 'on' : 'off');
		} catch {
			// Kept for this visit only.
		}
	}
	function remove() {
		if (!selected) return;
		const before = current();
		const name = selectedNode?.name ?? 'node';
		sheet = null;
		apply(removeNode(before, selected), before, `Delete “${name}”`);
	}

	// The prototype's shortcuts, away from text fields: ⌘Z / ⇧⌘Z (or ctrl+Y) undo and redo, ⌘D duplicates, ⌘A picks
	// every node, ⌘C / ⌘X / ⌘V copy, cut and paste, Delete or Backspace removes what is selected, and Escape lets go.
	function shortcut(e: KeyboardEvent) {
		// Keys pressed in a field or a sheet (Escape closing one, say) are theirs, not the canvas's.
		if (e.defaultPrevented || (e.target as Element).closest?.('input, textarea, select, [contenteditable], dialog')) return;
		const k = e.key.toLowerCase();
		const action = e.metaKey || e.ctrlKey ? metaKey(k, e.shiftKey) : k === 'delete' || k === 'backspace' ? deleteKey() : k === 'escape' ? escapeKey() : null;
		if (!action) return;
		e.preventDefault();
		action();
	}
	function metaKey(k: string, shift: boolean): (() => void) | null {
		// Picking and copying work on any diagram you can see; the rest change it.
		if (k === 'a') return pickAll;
		if (k === 'c') return pickNow().nodes.length ? () => copyPicked(false) : null;
		if (!editable) return null;
		const keys: Record<string, (() => void) | null> = {
			z: shift ? redo : undo,
			y: redo,
			d: multi ? duplicatePicked : selected ? duplicate : selectedBox ? duplicateBox : null,
			x: pickNow().nodes.length ? () => copyPicked(true) : null,
			v: clipSize ? paste : null
		};
		return keys[k] ?? null;
	}
	function deleteKey(): (() => void) | null {
		if (!editable) return null;
		if (multi) return removePicked;
		if (selected) return remove;
		if (selectedEdge !== null) return disconnect;
		return selectedBox ? removeBox : null;
	}
	function escapeKey(): (() => void) | null {
		if (presenting) return exitPresent;
		if (connectFrom || connectTool) return stopConnecting;
		if (adding) return () => (adding = false);
		return manyMode || multi ? stopPicking : null;
	}
	// Don't let a change go unsaved by leaving: save it on the way to another page, and ask before a reload or close.
	beforeNavigate(() => {
		if (working.saver.state === 'pending' && !deleted) void working.saver.flush();
	});

	// The diagram as a whole: rename, copy, delete, snapshot.
	let deleted = false;
	function rename(name: string) {
		if (!mine) return;
		working.name = name;
		const doc = current();
		working.doc = { ...doc, diagram: { ...doc.diagram, name } };
		working.saver.queue($state.snapshot(working.doc) as SkopeDoc);
	}
	function setKind(to: KindId) {
		if (!mine || to === kind.id) return;
		const before = current();
		apply({ ...before, diagram: { ...before.diagram, kind: to } }, before, `Make it ${kindOf(to).label}`);
	}
	async function copy({ workspace, name, follow }: { workspace: string; name: string; follow: boolean }) {
		// A duplicate is the diagram as it is now; a follower starts from its latest snapshot, as the server makes one.
		const made = follow
			? await api.createDiagram({ workspace, name, from: data.diagram.id, follow: true })
			: await api.createDiagram({ workspace, name, doc: { ...current(), diagram: { ...current().diagram, name } } });
		sheet = null;
		await goto(resolve('/d/[id]', { id: made.id }));
	}
	async function destroy() {
		await api.deleteDiagram(data.diagram.id);
		deleted = true;
		sheet = null;
		await goto(`${resolve('/')}?ws=${encodeURIComponent(data.diagram.workspaceId)}`, { invalidateAll: true });
	}
	async function takeSnapshot(label: string) {
		const made = await api.createSnapshot(data.diagram.id, { label, doc: current() });
		working.snapshots = [...working.snapshots, made];
	}
	$effect(() => {
		if (!working.saver.unsaved || deleted) return;
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
	let sheet = $state<'views' | 'history' | 'details' | 'add' | 'edge' | 'box' | 'tags' | 'diagram' | 'multi' | 'config' | null>(null);
	// The updates are beside the canvas on a wide screen, and lead the History sheet on a phone.
	function showUpdates() {
		if (narrow) sheet = 'history';
		else document.getElementById('updates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	// Moving mode: a drag anywhere on the canvas moves the selected node. It is how a finger moves a node (a mouse
	// can drag one directly), chosen from the node menu, and ends with the selection.
	let moving = $state(false);
	function select(id: string | null) {
		if (id !== selected) moving = false;
		multi = null;
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
		solo = null;
	};
	// Switching a tag keeps the view chosen (the panel marks it changed), so its tags can be saved back into it.
	const toggleTag = (k: string) => {
		on = { ...on, [k]: !on[k] };
		solo = null;
	};
	// Solo shows one tag alone; again, or on another tag, and the switches come back as they were.
	function soloTag(k: string) {
		if (solo === k) {
			on = beforeSolo ?? tagsOn(scene, null);
			solo = null;
			return;
		}
		if (!solo) beforeSolo = on;
		on = Object.fromEntries(scene.tags.map(t => [t.key, t.key === k]));
		solo = k;
		view = null;
	}

	// The side panels, shown or folded away; a viewer setting kept in this browser.
	let panels = $state({ left: true, right: true });
	$effect.pre(() => {
		untrack(() => {
			try {
				const saved = JSON.parse(localStorage.getItem('skope.panels') ?? '{}') as Record<string, unknown>;
				panels = { left: saved.left !== false, right: saved.right !== false };
			} catch {
				// Both shown.
			}
		});
	});
	function fold(side: 'left' | 'right') {
		panels = { ...panels, [side]: !panels[side] };
		try {
			localStorage.setItem('skope.panels', JSON.stringify(panels));
		} catch {
			// Kept for this visit only.
		}
	}

	// Isolate shows just a node's tags (only what this browser shows, like the switches); Everything brings back all.
	function isolate(id: string) {
		const n = scene.nodes.find(x => x.id === id);
		if (!n?.tags.length) return;
		on = Object.fromEntries(scene.tags.map(t => [t.key, n.tags.includes(t.key)]));
		solo = null;
		view = null;
		notify(`Showing only ${n.name}'s tags`);
	}

	// Views and tags are part of the document: saved, and undone like any other edit.
	const tagsOnNow = () => scene.tags.filter(t => on[t.key]).map(t => t.key);
	function saveView() {
		const before = current();
		const made = addView(before, tagsOnNow());
		apply(made.doc, before, `Save view “${made.name}”`);
		view = made.name;
		solo = null;
	}
	function renameView(name: string, to: string): boolean {
		const before = current();
		if (!viewNameFree(before, to, name)) return false;
		apply(updateView(before, name, { name: to }), before, 'Rename view');
		if (view === name) view = to.trim();
		return true;
	}
	function resaveView(name: string) {
		const before = current();
		apply(updateView(before, name, { tags: tagsOnNow() }), before, `Save view “${name}”`);
	}
	function deleteView(name: string) {
		const before = current();
		apply(removeView(before, name), before, `Delete view “${name}”`);
		if (view === name) view = null;
	}
	function lockViewTo(name: string, lock: boolean) {
		const before = current();
		apply(lockView(before, name, lock), before, `${lock ? 'Lock' : 'Unlock'} view “${name}”`);
	}
	function defaultView(name: string | null) {
		const before = current();
		apply(setDefaultView(before, name), before, name ? `Open on “${name}”` : 'Open on everything');
	}
	// A new tag starts switched on, so the nodes it goes on stay in sight.
	function newTag(label: string, group?: string) {
		const before = current();
		const made = addTag(before, label, group);
		apply(made.doc, before, `Add tag “${label}”`);
		on = { ...on, [made.key]: true };
	}
	function newTagOnNode(label: string) {
		const node = selected ? current().nodes?.find(n => n.id === selected) : undefined;
		if (!node) return;
		const before = current();
		const made = addTag(before, label);
		apply(updateNode(made.doc, node.id, { tags: [...(node.tags ?? []), made.key] }), before, `Tag “${label}”`);
		on = { ...on, [made.key]: true };
	}
	function changeTag(key: string, change: { label?: string; color?: string; group?: string }, label: string, group?: string) {
		const before = current();
		apply(updateTag(before, key, change), before, label, group);
	}
	function deleteTag(key: string) {
		const before = current();
		const name = scene.tags.find(t => t.key === key)?.label ?? key;
		apply(removeTag(before, key), before, `Delete tag “${name}”`);
		if (solo === key) {
			on = beforeSolo ?? tagsOn(scene, null);
			solo = null;
		}
	}
	const tagCounts = $derived(Object.fromEntries(scene.tags.map(t => [t.key, scene.nodes.filter(n => n.tags.includes(t.key)).length])));
	const pick = (id: string | null) => {
		replaying = id;
		sheet = null;
	};

	// The getting-started tour, when this is its practice diagram and it isn't finished. Its place is read once per
	// diagram (later saves don't reload the page's data) and kept in the account as it moves on.
	let tour = $state<TourState | null>(null);
	let tourStart = $state<TourCounts | null>(null);
	let tourFor = '';
	$effect.pre(() => {
		const id = data.diagram.id;
		if (id === tourFor) return;
		tourFor = id;
		const t = untrack(() => tourOf(data.me));
		// Just started (?tour=1, from Tutorial or the offer on home): from the top, whatever the settings say.
		const fresh = untrack(() => page.url.searchParams.get('tour')) === '1';
		if (fresh) {
			tour = { diagram: id, step: 0 };
			// Off the address, so a reload carries on from the saved step rather than starting again.
			const url = new URL(untrack(() => page.url.href));
			url.searchParams.delete('tour');
			queueMicrotask(() => replaceState(url, {}));
		}
		else tour = t && !t.done && t.diagram === id ? t : null;
		tourStart = null;
	});
	const counts = $derived(tourCounts(working.doc, presenting));
	function tourTo(step: number) {
		if (!tour) return;
		tour = { ...tour, step: Math.max(0, Math.min(step, TOUR.length - 1)) };
		tourStart = counts;
		saveTour(api, tour).catch(() => {});
	}
	function endTour() {
		if (!tour) return;
		saveTour(api, { ...tour, done: true }).catch(() => {});
		tour = null;
	}
	// A step with a check moves on by itself once it's done.
	$effect(() => {
		if (!tour) return;
		const now = counts;
		const start = untrack(() => tourStart);
		if (!start) {
			tourStart = now;
			return;
		}
		const step = TOUR[tour.step];
		if (step.done?.(now, start)) untrack(() => tourTo(tour!.step + 1));
	});
</script>

<svelte:head><title>{working.name} · Skope</title></svelte:head>
<svelte:window
	onkeydown={shortcut}
	onpointerdown={e => {
		// The add menu closes on a press anywhere outside it (its own button toggles it).
		if (adding && !(e.target as Element).closest('.add-menu, .tool.add')) adding = false;
	}}
/>

{#if presenting}
	<div class="present-bar" role="region" aria-label="Presenting">
		<span class="p-title"><span class="p-name">{working.name}</span><span class="p-sub">Presenting · {appearance.iconCards ? 'icon cards' : 'read-only'}</span></span>
		{#if scene.views.length}
			<select class="p-view" aria-label="View" value={view ?? ''} onchange={e => setView(e.currentTarget.value || null)}>
				<option value="">Everything</option>
				{#each scene.views as v (v.label)}<option value={v.label}>{v.label}</option>{/each}
			</select>
		{/if}
		<button
			type="button"
			class="p-icons"
			aria-pressed={appearance.iconCards}
			aria-label="Icon-only cards"
			title={appearance.iconCards ? 'Show full node cards' : 'Icon-only cards: icons and names'}
			onclick={() => appearance.set({ iconCards: !appearance.iconCards })}
		>
			<Icon name="grid" size={14} />
		</button>
		<button type="button" class="btn btn-ghost p-exit" onclick={exitPresent}>Exit{narrow ? '' : ' · Esc'}</button>
	</div>
{:else}
<AppHeader
	me={data.me}
	homeHref={resolve('/')}
	crumbs={[
		...(workspace ? [{ label: workspace.name, href: `${resolve('/')}?ws=${encodeURIComponent(workspace.id)}` }] : []),
		{ label: working.name, onclick: () => (sheet = 'diagram'), title: mine ? 'Rename, copy or delete this diagram' : 'Copy this diagram' }
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
			{:else if flash && !narrow}
				{flash}
			{:else if locked}
				Locked on this device · <button type="button" class="link" onclick={() => setLock(false)}>Unlock</button>
			{:else if modeHint && !narrow}
				{modeHint}
			{:else}
				Saved{working.history.undoLabel || narrow ? '' : ' · double-click the canvas to add a node, or a node to rename it'}
			{/if}
		</span>
	{/if}
	{#if follow.kind === 'following'}
		<span class="follow" data-testid="follow">
			<Icon name="follow" size={12} />
			Follows <a href={resolve('/d/[id]', { id: follow.leadId })}>{follow.leadName}</a>
			{#if !narrow}· {follow.syncedLabel ? `synced to “${follow.syncedLabel}”` : 'not synced yet'}{/if}
			{#if follow.paused}· paused{:else if openUpdates > 0}·
				<button type="button" class="link" onclick={showUpdates}>{plural(openUpdates, 'change')} to review</button>{:else}· up to date{/if}
		</span>
	{:else if follow.kind === 'gone'}
		<span class="follow gone" data-testid="follow">No longer following: its lead was deleted or you left its workspace</span>
	{/if}
	{#if !narrow}
		<button type="button" class="link present-link" data-tour="present" onclick={present}>Present</button>
	{/if}
</div>

{#if replayed}
	<div class="replay" role="status">
		Replaying “{replayed.label}” · {replayed.authorEmail} · {ago(replayed.createdAt, now)}
		<button type="button" class="btn btn-ghost" onclick={() => (replaying = null)}>Back to the working copy</button>
	</div>
{/if}
{/if}

{#snippet nodeInspector()}
	{#if selectedNode}
		<Inspector
			{cats}
			{kind}
			node={selectedNode}
			tags={tagByKey}
			{editable}
			onchange={changeNode}
			onfieldend={() => working.history.endGroup()}
			ondelete={remove}
			onduplicate={duplicate}
			{connections}
			onnewtag={newTagOnNode}
			onisolate={() => selected && isolate(selected)}
			onpickedge={i => {
				selectEdge(i);
				if (narrow) sheet = 'edge';
			}}
		/>
	{/if}
{/snippet}
{#snippet addButton()}
	<button type="button" class="tool add" data-tour="add" title="Every type, and containers" aria-expanded={narrow ? sheet === 'add' : adding} onclick={() => (narrow ? (sheet = 'add') : (adding = !adding))}>
		<span aria-hidden="true">+</span> Add
	</button>
{/snippet}
{#snippet addChoices(focus: boolean)}
	{#if clipSize}
		<button type="button" class="add-box" onclick={paste}><Icon name="note" size={15} />Paste {plural(clipSize, 'node')}<span>what you copied</span></button>
	{/if}
	<button type="button" class="add-box" onclick={addBox}><Icon name="frameCorners" size={15} />Container<span>a labelled box to group nodes</span></button>
	<TypePicker {cats} {kind} autofocus={focus} onpick={add} />
{/snippet}
{#snippet multiInspector()}
	{#if multi}
		<MultiInspector
			nodes={multiNodes}
			edges={multiEdges}
			tags={scene.tags}
			{editable}
			ontype={typeMany}
			ontag={tagMany}
			onedges={edgesMany}
			oncopy={() => copyPicked(false)}
			onduplicate={duplicatePicked}
			ondelete={removePicked}
			onclear={stopPicking}
		/>
	{/if}
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
	<TagPanel
		{scene}
		{on}
		{view}
		onview={setView}
		ontoggle={toggleTag}
		{solo}
		onsolo={soloTag}
		{editable}
		onsaveview={saveView}
		onrenameview={renameView}
		onresaveview={resaveView}
		ondeleteview={deleteView}
		ondefaultview={defaultView}
		onlockview={lockViewTo}
		onmanage={() => (sheet = 'tags')}
	/>
{/snippet}
{#snippet followPanel()}
	{#if follow.kind === 'following'}
		<div id="updates">
			<FollowPanel
				leadName={follow.leadName}
				leadHref={resolve('/d/[id]', { id: follow.leadId })}
				groups={updates}
				decided={working.follow.decided}
				paused={working.follow.paused}
				editable={editable}
				{now}
				onaccept={acceptChanges}
				onskip={skipChanges}
				onundecide={undecide}
				onpause={pauseFollow}
				onunlink={unlink}
				onreviewed={markReviewed}
			/>
		</div>
	{/if}
{/snippet}
{#snippet configPanel(close: boolean)}
	<ConfigPanel doc={replayed?.doc ?? working.doc} {editable} onapply={applyConfig} ondownload={downloadConfig} onclose={close ? () => (configOpen = false) : undefined} />
{/snippet}
{#snippet history()}
	<HistoryPanel snapshots={working.snapshots} current={replaying} onpick={pick} {now} ontake={mine && editable ? takeSnapshot : undefined} />
	{#if editable && working.history.steps.length}<EditList steps={working.history.steps} ongoto={goToEdit} />{/if}
{/snippet}

<div class="body">
	{#if !narrow && !presenting && panels.left}{@render tags()}{/if}
	<main class="stage" aria-label="Diagram" bind:this={stageEl}>
		{#if !narrow && !presenting}
			<!-- Each side panel folds away for more canvas; this browser remembers which. -->
			<button type="button" class="fold fold-left" aria-expanded={panels.left} aria-label={panels.left ? 'Hide views and tags' : 'Show views and tags'} title={panels.left ? 'Hide views and tags' : 'Show views and tags'} onclick={() => fold('left')}>
				<Icon name={panels.left ? 'caretLeft' : 'caretRight'} size={12} />
			</button>
			<button type="button" class="fold fold-right" aria-expanded={panels.right} aria-label={panels.right ? 'Hide the side panel' : 'Show the side panel'} title={panels.right ? 'Hide the side panel' : 'Show the side panel'} onclick={() => fold('right')}>
				<Icon name={panels.right ? 'caretRight' : 'caretLeft'} size={12} />
			</button>
		{/if}
		<DiagramCanvas
			bind:this={canvasRef}
			scene={iconCards ? iconScene(scene) : scene}
			{iconCards}
			frame={iconCards ? scene : undefined}
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
			picking={editable && connectTool && !connectFrom}
			onresize={resize}
			onsetend={setEdgeEnd}
			showMinimap={!narrow}
			onaddat={addAt}
			{renaming}
			onrenamestart={startRename}
			onrename={renameNode}
			{snap}
			onsnap={editable ? setSnap : undefined}
			{multi}
			{manyMode}
			onpick={boxPick}
			ontoggle={togglePick}
			onmovemany={moveMany}
			onhover={narrow ? undefined : hovering}
		/>
		{#if tipNode}
			<div class="tip-at" class:docked={narrow} style:left={narrow ? undefined : `${tipAt.left}px`} style:top={narrow ? undefined : `${tipAt.top}px`}>
				<NodeTip node={tipNode} tags={tagByKey} connections={tipEdges} />
			</div>
		{/if}
		{#if narrow && (flash || modeHint)}
			<p class="mode-hint" data-testid="mode-hint">{flash || modeHint}</p>
		{/if}
		{#if editable}
			<!-- The prototype's toolbar: undo and redo, how a click on the canvas works, then one click to add the
			     common types, with Add for the rest. A phone keeps Add, undo and redo; its node menu connects. -->
			<div class="tools" role="toolbar" aria-label="Edit">
				{#if narrow}
					{@render addButton()}
				{/if}
				<button type="button" class="tool" data-tour="undo" aria-label={working.history.undoLabel ? `Undo ${working.history.undoLabel}` : 'Nothing to undo'} title={working.history.undoLabel ? `Undo: ${working.history.undoLabel} · ⌘Z` : 'Nothing to undo'} disabled={!working.history.undoLabel} onclick={undo}>
					<Icon name="arrowCCW" size={15} />
				</button>
				<button type="button" class="tool" aria-label={working.history.redoLabel ? `Redo ${working.history.redoLabel}` : 'Nothing to redo'} title={working.history.redoLabel ? `Redo: ${working.history.redoLabel} · ⇧⌘Z` : 'Nothing to redo'} disabled={!working.history.redoLabel} onclick={redo}>
					<Icon name="arrowCW" size={15} />
				</button>
				{#if !narrow}
					<span class="sep" aria-hidden="true"></span>
					<button
						type="button"
						class="tool"
						class:on={!connectTool && !connectFrom && !manyMode}
						aria-pressed={!connectTool && !connectFrom && !manyMode}
						aria-label="Select"
						title="Select · drag to move, double-click to rename, ⌘A for all"
						onclick={() => {
							stopConnecting();
							manyMode = false;
						}}
					>
						<Icon name="cursor" size={15} />
					</button>
					<button type="button" class="tool" class:on={manyMode} aria-pressed={manyMode} aria-label="Multi-select" title="Multi-select · drag a box, or click to pick; shift-click works any time" onclick={toggleManyMode}>
						<Icon name="marquee" size={15} />
					</button>
					<button type="button" class="tool" class:on={connectTool || !!connectFrom} aria-pressed={connectTool || !!connectFrom} aria-label="Connect" data-tour="connect" title="Connect two nodes · click one, then the other" onclick={toggleConnectTool}>
						<Icon name="flowArrow" size={15} />
					</button>
					<span class="sep" aria-hidden="true"></span>
					{#each QUICK_ADD as [type, icon] (type)}
						<button type="button" class="tool" aria-label="Add {type === 'Text' ? 'free text' : type.toLowerCase()}" title={type === 'Text' ? 'Free text' : type} onclick={() => add(type)}>
							<Icon name={icon} size={15} />
						</button>
					{/each}
					<button type="button" class="tool" data-tour="container" aria-label="Add container" title="Container" onclick={addBox}>
						<Icon name="frameCorners" size={15} />
					</button>
					<span class="sep" aria-hidden="true"></span>
					{@render addButton()}
					<span class="sep" aria-hidden="true"></span>
					<button type="button" class="tool" class:on={configOpen} aria-pressed={configOpen} aria-label="Config" title="The diagram as YAML or JSON: edit, download or open a file" onclick={() => (configOpen = !configOpen)}>
						<Icon name="code" size={15} />
					</button>
				{/if}
			</div>
			{#if adding && !narrow}
				<div class="add-menu" role="dialog" aria-label="Add a node">
					{@render addChoices(true)}
				</div>
			{/if}
		{/if}
	</main>
	{#if !narrow && !presenting && panels.right}
		<aside class="right" class:wide={configOpen}>
			{#if configOpen}{@render configPanel(true)}{/if}
			{@render multiInspector()}
			{@render nodeInspector()}
			{@render edgeInspector()}
			{@render boxInspector()}
			{@render followPanel()}
			{@render history()}
		</aside>
	{/if}
</div>

{#if narrow && !presenting}
	{#if manyMode || multi}
		<!-- Picking many: what they are, moving them together, deleting them, and Done. -->
		<nav class="toolbar node-menu" aria-label="Picked" data-testid="multi-menu">
			<button type="button" disabled={!multi?.nodes.length && !multi?.edges.length} onclick={() => (sheet = 'multi')}>
				<span class="t-label">{editable ? 'Edit' : 'Picked'}</span><span class="t-value">{multi?.nodes.length || multi?.edges.length ? pickLabel(multi) : 'Tap to pick'}</span>
			</button>
			{#if editable}
				<button type="button" class:active={moving} aria-pressed={moving} disabled={!multi?.nodes.length} onclick={() => (moving = !moving)}>
					<span class="t-label">{moving ? 'Moving' : 'Move'}</span><span class="t-value">{moving ? 'Drag anywhere' : 'All together'}</span>
				</button>
				<button type="button" class="narrow-btn" disabled={!multi?.nodes.length && !multi?.edges.length} onclick={removePicked}>
					<span class="t-label">Delete</span><span class="t-value">Picked</span>
				</button>
			{/if}
			<button type="button" class="done" aria-label="Done picking" onclick={stopPicking}>
				<span class="t-label">Done</span><span class="t-value">×</span>
			</button>
		</nav>
	{:else if selectedNode}
		<!-- The node menu takes the toolbar's place while a node is selected. -->
		<nav class="toolbar node-menu" aria-label="Selected node" data-testid="node-menu">
			<!-- Edit leads, as View leads the bar it replaces; the ways to change the canvas follow. -->
			<button type="button" data-tour="node-edit" onclick={() => (sheet = 'details')}>
				<span class="t-label">{editable ? 'Edit' : 'Details'}</span><span class="t-value">{selectedNode.name}</span>
			</button>
			<button type="button" class:active={moving} aria-pressed={moving} disabled={!editable} title={editable ? '' : replayed ? 'Go back to the working copy to move nodes' : 'Only the owner can move nodes'} onclick={() => (moving = !moving)}>
				<span class="t-label">{moving ? 'Moving' : 'Move'}</span><span class="t-value">{moving ? 'Drag anywhere · tap to stop' : 'Drag to place'}</span>
			</button>
			{#if editable}
				<button type="button" data-tour="connect" class:active={connectFrom === selectedNode.id} aria-pressed={connectFrom === selectedNode.id} onclick={() => (connectFrom ? (connectFrom = null) : startConnect(selectedNode.id))}>
					<span class="t-label">{connectFrom ? 'Connecting' : 'Connect'}</span><span class="t-value">{connectFrom ? 'Tap a node or space · tap to stop' : 'to a node'}</span>
				</button>
			{/if}
			<button type="button" class="done" aria-label="Done with {selectedNode.name}" onclick={() => select(null)}>
				<span class="t-label">Done</span><span class="t-value">×</span>
			</button>
		</nav>
	{:else if selectedBoxScene}
		<!-- A selected container: a finger moves or resizes it from anywhere once one is chosen. -->
		<nav class="toolbar node-menu" aria-label="Selected container" data-testid="box-menu">
			<button type="button" onclick={() => (sheet = 'box')}>
				<span class="t-label">{editable ? 'Edit' : 'Details'}</span><span class="t-value">{selectedBoxScene.label || 'Container'}</span>
			</button>
			{#if editable}
				{#each [['move', 'Move', 'Moving'], ['resize', 'Resize', 'Resizing']] as const as [mode, label, active] (mode)}
					<button type="button" class:active={boxMode === mode} aria-pressed={boxMode === mode} onclick={() => (boxMode = boxMode === mode ? null : mode)}>
						<span class="t-label">{boxMode === mode ? active : label}</span><span class="t-value">{boxMode === mode ? 'Drag anywhere' : mode === 'move' ? 'Drag to place' : 'Drag to size'}</span>
					</button>
				{/each}
			{/if}
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
			<button type="button" data-tour="views" onclick={() => (sheet = 'views')}>
				<span class="t-label">View</span><span class="t-value">{view ?? (scene.views.length ? 'Everything' : 'Tags')}</span>
			</button>
			<button type="button" onclick={() => (sheet = 'history')}>
				<span class="t-label">History</span><span class="t-value"
					>{replayed ? replayed.label : openUpdates && !working.follow.paused ? `${openUpdates} to review` : plural(working.snapshots.length, 'snapshot')}</span
				>
			</button>
			<button type="button" onclick={toggleManyMode}>
				<span class="t-label">Select</span><span class="t-value">Many</span>
			</button>
		</nav>
	{/if}
	<Sheet open={sheet === 'views'} title="Views and tags" onclose={() => (sheet = null)}>{@render tags()}</Sheet>
	<!-- A follower's updates lead its history on a phone. -->
	<Sheet open={sheet === 'history'} title="History" onclose={() => (sheet = null)}>{@render followPanel()}{@render history()}</Sheet>
	<Sheet open={sheet === 'add'} title="Add a node" onclose={() => (sheet = null)}>
		<div class="add-sheet">{@render addChoices(false)}</div>
	</Sheet>
	<Sheet open={sheet === 'details' && !!selectedNode} title="Node details" onclose={() => (sheet = null)}>
		{@render nodeInspector()}
	</Sheet>
	<Sheet open={sheet === 'config'} title="Config" onclose={() => (sheet = null)}>{@render configPanel(false)}</Sheet>
	<Sheet open={sheet === 'multi' && !!multi} title="Picked" onclose={() => (sheet = null)}>
		{@render multiInspector()}
	</Sheet>
	<Sheet open={sheet === 'box' && !!selectedBoxScene} title="Container" onclose={() => (sheet = null)}>
		{@render boxInspector()}
	</Sheet>
	<Sheet open={sheet === 'edge' && !!selectedEdgeScene} title="Connection" onclose={() => (sheet = null)}>
		{@render edgeInspector()}
	</Sheet>
{/if}
<Sheet open={sheet === 'diagram'} title="Diagram" onclose={() => (sheet = null)}>
	<DiagramSheet
		name={working.name}
		{mine}
		workspaces={data.workspaces}
		here={data.diagram.workspaceId}
		onrename={rename}
		kind={kind.id}
		onkind={setKind}
		oncopy={copy}
		ondelete={destroy}
		link={shareLink}
		viewName={view}
		onpresent={present}
		{locked}
		onlock={setLock}
		onexport={exportImage}
		onconfig={openConfig}
		onmove={moveTo}
	/>
</Sheet>
<!-- The tag manager opens from the tags panel on any screen: a dialog on a wide one, a sheet on a phone. -->
<Sheet open={sheet === 'tags' && editable} title="Manage tags" onclose={() => (sheet = null)}>
	<TagManager tags={scene.tags} counts={tagCounts} onchange={changeTag} onfieldend={() => working.history.endGroup()} ondelete={deleteTag} onadd={newTag} condition={appearance.condition} palette={paletteOf(working.doc)} onpalette={switchPalette} />
</Sheet>


{#if tour}
	<TourCallout step={TOUR[tour.step]} index={tour.step} total={TOUR.length} {narrow} onnext={() => tourTo(tour!.step + 1)} onback={() => tourTo(tour!.step - 1)} onend={endTour} />
{/if}

<style>
	.present-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--color-divider);
		background: var(--color-surface);
	}
	.p-title {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.p-name {
		font-family: var(--font-heading);
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.p-sub {
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.p-view {
		-webkit-appearance: none;
		appearance: none;
		min-height: 32px;
		max-width: 40%;
		padding: 4px 10px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 12.5px;
	}
	.p-view option {
		background: var(--color-surface);
		color: var(--color-text);
	}
	.p-exit {
		flex: none;
		font-size: 12px;
	}
	.p-icons {
		flex: none;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		padding: 0;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.p-icons[aria-pressed='true'] {
		border-color: var(--color-accent-700);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		color: var(--color-accent);
	}
	.present-link {
		flex: none;
	}
	.tip-at {
		position: absolute;
		z-index: 4;
	}
	.tip-at.docked {
		left: 12px;
		right: 12px;
		bottom: 12px;
		display: flex;
		justify-content: center;
	}
	.tip-at.docked :global(.tip) {
		width: 100%;
	}
	@media (pointer: coarse) {
		.p-view {
			font-size: 16px;
		}
	}
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
	.tool.on {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	}
	.tools .sep {
		width: 1px;
		margin: 8px 3px;
		background: var(--color-divider);
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
	.fold {
		position: absolute;
		top: 50%;
		z-index: 5;
		width: 16px;
		height: 44px;
		margin-top: -22px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid var(--color-divider);
		background: var(--color-surface);
		color: var(--color-neutral-500);
		cursor: pointer;
	}
	.fold:hover {
		color: var(--color-accent);
	}
	.fold-left {
		left: 0;
		border-left: none;
		border-radius: 0 7px 7px 0;
	}
	.fold-right {
		right: 0;
		border-right: none;
		border-radius: 7px 0 0 7px;
	}
	.right.wide {
		width: 440px;
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
