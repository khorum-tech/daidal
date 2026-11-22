<script lang="ts">
	import { c4Desc, c4Kind, c4Name, CODE, codeSections, noteLines, wrapText, type SceneNode, type SceneTag } from '@khorum/daidal-core/model';
	import { FLAGS } from '@khorum/daidal-core/icons';
	import { signature } from '@khorum/daidal-core/code';
	import Icon from './Icon.svelte';

	/** One node on the canvas, read-only. Mirrors the prototype's card and text nodes (web/index.html). */
	let {
		node,
		tags,
		ghosted = false,
		ghostOpacity = 0.22,
		selected = false,
		dragging = false,
		connecting = false,
		iconOnly = false,
		onselect,
		ondetails
	}: {
		node: SceneNode;
		tags: Record<string, SceneTag>;
		ghosted?: boolean;
		ghostOpacity?: number;
		selected?: boolean;
		dragging?: boolean;
		/** A connection is waiting for its other end: tapping this node makes it. */
		connecting?: boolean;
		/** Presenting with icon-only cards: the type's icon and the name under it. Free text stays text. */
		iconOnly?: boolean;
		onselect?: (id: string, e: MouseEvent) => void;
		ondetails?: (id: string) => void;
	} = $props();

	const first = $derived(node.tags[0] ? tags[node.tags[0]] : undefined);
	const tagTitle = $derived(node.tags.map(t => tags[t]?.label).join(' · '));
	const flags = $derived(FLAGS.filter(f => node.flags.includes(f.id)));
	const hostOf = (u: string) => {
		try {
			return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host.replace(/^www\./, '');
		} catch {
			return u;
		}
	};
	const sigs = $derived(node.functions.map(f => ({ name: f.name, rest: signature(f).slice(f.name.length), full: signature(f), notes: f.notes ?? '' })));
	const parts = $derived(codeSections(node.members, sigs.map(s => s.full)));
	const linkTitle = $derived(node.links.map(l => l.label || hostOf(l.url)).join(' · '));

	// A card's name and subtitle wrap as they always have and use the room its height gives them, down to its
	// bottom border (the bottom padding included, as wrapped text always could), then end in an ellipsis rather than
	// spill out under the card. Sizes match the styles below: 1 px border and 11 px padding at the top, a 15 px head,
	// the name's 7 px gap and 18 px lines, the subtitle's 3 px gap and 14 px lines, 1 px border at the bottom.
	const room = $derived(node.h - 1 - 11 - 15 - 1);
	const hasSub = $derived(!!node.sub.trim());
	// The name may take every line it has room for beside one of subtitle; the subtitle gets what the name leaves,
	// by an estimate of the name's lines (wrapText measures roughly, so the name's own clamp doesn't use it).
	const nameLines = $derived(Math.max(1, Math.floor((room - 7 - (hasSub ? 17 : 0)) / 18)));
	const nameUses = $derived(Math.min(nameLines, wrapText(node.name, node.w - 28, 15).length));
	const subLines = $derived(Math.max(1, Math.floor((room - 7 - nameUses * 18 - 3) / 14)));
</script>

<button
	type="button"
	class="node"
	class:text={node.isText}
	class:note={node.isNote}
	class:c4={!!node.c4 && !iconOnly}
	data-role={node.c4?.role}
	class:ghost={ghosted}
	class:selected
	class:dragging
	class:connecting
	class:code={node.code && !iconOnly}
	class:icon-only={iconOnly && !node.isText && !node.isNote}
	data-node={node.id}
	style:left="{node.x}px"
	style:top="{node.y}px"
	style:width="{node.w}px"
	style:height="{node.h}px"
	style:opacity={ghosted ? ghostOpacity : 1}
	aria-pressed={selected}
	aria-label="{node.type}: {node.name}"
	onclick={e => {
		// The browser's own tap detection, so a tap works wherever a click does. Enter on the selected node (a click
		// with no pointer behind it) asks for its details.
		if (e.detail === 0 && selected) ondetails?.(node.id);
		else onselect?.(node.id, e);
	}}
>
	{#if node.isText}
		<span class="text-name">{node.name}</span>
	{:else if node.isNote}
		<span class="note-name">{node.name}</span>
		{#each noteLines(node.desc, node.w) as line, i (i)}<span class="note-line">{line}</span>{/each}
	{:else if node.c4 && !iconOnly}
		<!-- C4 notation: the name, its element line ("[Container: Kotlin]"), and its notes as a short description. -->
		{#if first}<span class="c4-edge" title={tagTitle} style:background={first.color}></span>{/if}
		{#if node.c4.role === 'person'}<span class="c4-head" aria-hidden="true"></span>{/if}
		{#if node.zooms.length}
			<span class="zoom-mark c4-zoom" title="Zooms into {node.zooms.length === 1 ? 'a diagram' : `${node.zooms.length} diagrams`}"><Icon name="magnifyingGlassPlus" size={12} label="Zooms in" /></span>
		{/if}
		{#each c4Name(node.name, node.w) as line, i (i)}<span class="c4-name">{line}</span>{/each}
		{#each c4Kind(node.c4.line, node.w) as line, i (i)}<span class="c4-kind">{line}</span>{/each}
		{#if node.c4.desc.trim()}
			<span class="c4-desc">{#each c4Desc(node.c4.desc, node.w) as line, i (i)}<span>{line}</span>{/each}</span>
		{/if}
	{:else if iconOnly}
		<span class="big-icon"><Icon name={node.icon} size={46} /></span>
		<span class="icon-name">{node.name}</span>
	{:else}
		<span class="head">
			<span class="type-icon"><Icon name={node.icon} size={15} /></span>
			<span class="type">{node.type}</span>
			<span class="badges">
				{#each flags as f (f.id)}<span title={f.label} class="flag"><Icon name={f.icon} size={11} label={f.label} /></span>{/each}
				{#if first}<span class="dot" title={tagTitle} style:background={first.color}></span>{/if}
			</span>
			{#if node.zooms.length}
				<span class="zoom-mark" title="Zooms into {node.zooms.length === 1 ? 'a diagram' : `${node.zooms.length} diagrams`}"><Icon name="magnifyingGlassPlus" size={11} label="Zooms in" /></span>
			{/if}
			{#if node.links.length}
				<span class="links" title={linkTitle}><Icon name="globe" size={11} />{node.links.length}</span>
			{/if}
		</span>
		{#if node.code}
			<!-- A code block: the name in monospace, its purpose and path, then what it exposes, a line each. -->
			<span class="code-name" title={node.name}>{node.name}</span>
			{#if node.sub.trim()}<span class="code-sub" title={node.sub}>{node.sub}</span>{/if}
			{#if node.path}<span class="code-path" title={node.path}><bdi>{node.path}</bdi></span>{/if}
			{#if parts.members.shown.length || parts.members.more}
				<span class="members" style:--line="{CODE.line}px">
					{#each parts.members.shown as m, i (i)}<span class="member" title={m}>{m}</span>{/each}
					{#if parts.members.more}<span class="more">+{parts.members.more} more</span>{/if}
				</span>
			{/if}
			{#if parts.functions.shown.length || parts.functions.more}
				<!-- Its functions as signatures: the name in the text colour, parameters and return type quieter. -->
				<span class="members functions" style:--line="{CODE.line}px">
					{#each sigs.slice(0, parts.functions.shown.length) as f, i (i)}<span class="member fn" title={f.notes ? `${f.full}\n${f.notes}` : f.full}>{f.name}<span class="fn-rest">{f.rest}</span></span>{/each}
					{#if parts.functions.more}<span class="more">+{parts.functions.more} more</span>{/if}
				</span>
			{/if}
		{:else}
			<span class="name" title={node.name} style:--lines={nameLines}>{node.name}</span>
			{#if hasSub}<span class="sub" title={node.sub} style:--lines={subLines}>{node.sub}</span>{/if}
		{/if}
	{/if}
</button>

<style>
	.node {
		position: absolute;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		text-align: left;
		padding: 11px 13px;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		border: 1px solid var(--color-neutral-800);
		box-shadow: var(--shadow-sm);
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
		transition: opacity 0.25s;
	}
	.node.ghost {
		border: 1px dashed var(--color-neutral-700);
	}
	.node.selected:not(.ghost) {
		border-color: var(--color-accent);
		box-shadow:
			0 0 0 1px var(--color-accent),
			0 0 24px rgba(145, 132, 217, 0.25);
	}
	.node.dragging {
		z-index: 2;
		transition: none;
		box-shadow:
			0 0 0 1px var(--color-accent),
			0 12px 32px rgba(0, 0, 0, 0.45);
	}
	.node:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}
	.node.text {
		flex-direction: row;
		align-items: center;
		padding: 8px 10px;
		border-radius: 8px;
		background: transparent;
		border: 1px dashed transparent;
		box-shadow: none;
	}
	.node.text.selected {
		border: 1px solid var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	}
	/* A sticky note: a warm tint, the name as a small heading and the notes below; the lines are the ones the export
	   draws (noteLines), so the card and the file agree. */
	.node.note {
		padding: 12px;
		background: color-mix(in srgb, #e3c46a 18%, var(--color-surface));
		border-color: color-mix(in srgb, #e3c46a 38%, var(--color-neutral-800));
	}
	.note-name {
		font-family: var(--font-heading);
		font-weight: 600;
		font-size: 13px;
		line-height: 18px;
		overflow-wrap: anywhere;
		margin-bottom: 4px;
	}
	.note-line {
		font-size: 12px;
		line-height: 17px;
		min-height: 17px;
		color: var(--color-neutral-300);
		white-space: pre;
	}
	/* C4 notation. The fill says what a thing is: people and systems strongest, then containers, then components;
	   what's outside the system is grey. A person has a head above the box, a store a cylinder's rim. Sizes match
	   C4 in model.ts, which the export uses too. */
	.node.c4 {
		align-items: center;
		/* The text sits in the middle of the room under the head or rim, as the export draws it (c4Markup). */
		justify-content: center;
		text-align: center;
		padding: 12px;
		border-color: color-mix(in srgb, var(--color-accent) 55%, var(--color-neutral-800));
		background: color-mix(in srgb, var(--color-accent) var(--c4-fill), var(--color-surface));
		--c4-fill: 22%;
	}
	.node.c4[data-role='person'],
	.node.c4[data-role='system'] {
		--c4-fill: 34%;
	}
	.node.c4[data-role='component'] {
		--c4-fill: 12%;
	}
	.node.c4[data-role='external'] {
		background: color-mix(in srgb, var(--color-neutral-500) 22%, var(--color-surface));
		border-color: var(--color-neutral-700);
	}
	.node.c4[data-role='person'] {
		padding-top: 26px;
		border-radius: 22px;
	}
	.node.c4[data-role='store'] {
		padding-top: 22px;
		border-radius: 50% / 14px;
	}
	.c4-head {
		position: absolute;
		top: -14px;
		left: 50%;
		width: 34px;
		height: 34px;
		margin-left: -17px;
		border-radius: 50%;
		background: inherit;
		border: inherit;
		box-sizing: border-box;
	}
	.c4-zoom {
		position: absolute;
		top: 8px;
		right: 8px;
	}
	.c4-edge {
		position: absolute;
		left: 0;
		top: 10px;
		bottom: 10px;
		width: 3px;
		border-radius: 0 2px 2px 0;
	}
	.c4-name {
		font-family: var(--font-heading);
		font-weight: 600;
		font-size: 14px;
		line-height: 18px;
		white-space: pre;
	}
	.c4-kind {
		font-size: 11px;
		line-height: 15px;
		color: var(--color-neutral-300);
		white-space: pre;
	}
	.c4-desc {
		display: flex;
		flex-direction: column;
		margin-top: 6px;
		font-size: 11.5px;
		line-height: 15px;
		color: var(--color-text);
		white-space: pre;
	}
	.text-name {
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: 17px;
		line-height: 1.3;
		text-wrap: pretty;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.type-icon {
		color: var(--color-accent);
		display: flex;
	}
	.type {
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
		/* One line, cut with an ellipsis, as the export draws it: a long type must not push the badges out. */
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badges {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-accent-300);
	}
	.flag {
		display: flex;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.zoom-mark {
		display: flex;
		flex: none;
		color: var(--color-accent-300);
	}
	.links {
		display: flex;
		align-items: center;
		gap: 2px;
		flex: none;
		font-size: 9.5px;
		color: var(--color-neutral-500);
	}
	.name {
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: 15px;
		margin-top: 7px;
		line-height: 1.2;
	}
	/* The name and the subtitle wrap, up to the lines the card's height has room for (--lines, worked out above),
	   and end in an ellipsis past that: a card has a fixed height, so more would spill out under it. The whole
	   text is in the node's details, and under the pointer. */
	.name,
	.sub {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: var(--lines, 1);
		line-clamp: var(--lines, 1);
		overflow: hidden;
		overflow-wrap: anywhere;
		flex: none;
	}
	.sub {
		font-size: 11.5px;
		line-height: 14px;
		color: var(--color-neutral-500);
		margin-top: 3px;
	}
	/* A code block. The sizes are model.ts CODE's, which also sets the card's height and the export's lines. */
	.code-name,
	.code-path,
	.member {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: none;
	}
	.code-name {
		font-size: 13.5px;
		font-weight: 600;
		line-height: 18px;
		margin-top: 7px;
	}
	.code-sub {
		font-size: 11.5px;
		line-height: 16px;
		margin-top: 2px;
		color: var(--color-neutral-500);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: none;
	}
	.code-path {
		font-size: 10.5px;
		line-height: 14px;
		margin-top: 1px;
		color: var(--color-neutral-600);
		/* Cut from the start: the file's name, at the end, is what tells paths apart. */
		direction: rtl;
		text-align: left;
	}
	.members {
		display: flex;
		flex-direction: column;
		flex: none;
		margin: 8px -13px 0;
		padding: 6px 13px 0;
		border-top: 1px solid var(--color-neutral-800);
	}
	.member,
	.more {
		font-size: 11.5px;
		line-height: var(--line);
	}
	.fn-rest {
		color: var(--color-neutral-500);
	}
	.more {
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.node.icon-only {
		align-items: center;
		justify-content: center;
		padding: 0;
		background: transparent;
		border-color: transparent;
		box-shadow: none;
	}
	.node.icon-only.selected:not(.ghost) {
		border-color: transparent;
		box-shadow: none;
	}
	.node.icon-only.ghost {
		border-color: transparent;
	}
	.big-icon {
		display: flex;
		color: var(--color-accent);
	}
	.node.icon-only.selected .big-icon {
		color: var(--color-accent-200);
	}
	.icon-name {
		position: absolute;
		left: -40px;
		right: -40px;
		top: calc(50% + 27px);
		text-align: center;
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: 13px;
		line-height: 1.25;
		color: var(--color-neutral-300);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.node.connecting {
		cursor: crosshair;
	}
	.node.connecting:hover {
		border-color: var(--color-accent);
	}
</style>
