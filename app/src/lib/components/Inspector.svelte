<script lang="ts">
	import { docLinks, type SceneNode, type SceneTag, type ZoomLink } from '@khorum/daidal-core/model';
	import type { NodeChange } from '@khorum/daidal-core/edit';
	import { hostOf, linkUrl } from '@khorum/daidal-core/edit';
	import { FLAGS, ICON_LIBRARY, TYPE_CATS, type TypeCats } from '@khorum/daidal-core/icons';
	import { kindOf, type Kind } from '@khorum/daidal-core/kinds';
	import Icon from './Icon.svelte';
	import IconPicker from './IconPicker.svelte';
	import TypePicker from './TypePicker.svelte';

	/**
	 * What a selected node holds. Read-only by default; with [editable] on, it is the prototype's inspector: name,
	 * subtitle and notes edit in place, and type, flags, tags and links change with a tap. Each change goes to
	 * [onchange] with a label for undo; typing into one field reports a [group] that lasts until the field loses
	 * focus ([onfieldend]), so it undoes as one step.
	 */
	let {
		node,
		tags,
		editable = false,
		onchange,
		onfieldend,
		ondelete,
		onduplicate,
		connections = [],
		onpickedge,
		onnewtag,
		onisolate,
		cats = TYPE_CATS,
		kind = kindOf(''),
		diagrams = null,
		onzoom,
		onzoomnew,
		onzoomup
	}: {
		node: SceneNode;
		tags: Record<string, SceneTag>;
		editable?: boolean;
		onchange?: (change: NodeChange, label: string, group?: string) => void;
		onfieldend?: () => void;
		ondelete?: () => void;
		onduplicate?: () => void;
		/** The node's connections: [out] when it starts here, and the node at the other end. */
		connections?: { index: number; out: boolean; name: string; label: string }[];
		onpickedge?: (index: number) => void;
		/** A tag made here, by name: it lands in "Unlabelled" and goes on this node. */
		onnewtag?: (label: string) => void;
		/** Shows only this node's tags, as the prototype's Isolate does; nothing is saved. */
		onisolate?: () => void;
		/** The workspace's types, for the type picker. */
		cats?: TypeCats;
		/** The diagram's kind: its common types come first when changing a node's type. */
		kind?: Kind;
		/**
		 * The workspace's other diagrams this person can see, by id: what a node can zoom into. A link to one not here
		 * is hidden, as the API hides a diagram you can't see. Null while they load.
		 */
		diagrams?: { id: string; name: string }[] | null;
		/** Opens the diagram a link zooms into. */
		onzoom?: (link: ZoomLink) => void;
		/** In a C4 diagram, makes the level below this node as a new diagram, links the node to it and opens it. */
		onzoomnew?: () => Promise<void>;
		/** In a C4 diagram below Context, makes the level above as a new diagram from this node and opens it. */
		onzoomup?: () => Promise<void>;
	} = $props();
	let naming = $state(false);
	let tagName = $state('');
	function newTag(e: SubmitEvent) {
		e.preventDefault();
		if (!tagName.trim()) return;
		onnewtag?.(tagName.trim());
		tagName = '';
		naming = false;
	}

	let picking = $state(false);
	let pickingIcon = $state(false);
	let linkLabel = $state('');
	let linkAddress = $state('');
	// A different node starts with the type list closed and an empty link form.
	let shown = $state('');
	$effect.pre(() => {
		if (node.id === shown) return;
		shown = node.id;
		picking = false;
		pickingIcon = false;
		naming = false;
		linkLabel = '';
		linkAddress = '';
	});

	const addable = $derived(Object.values(tags).filter(t => !node.tags.includes(t.key)));
	const nameOf = $derived(new Map((diagrams ?? []).map(d => [d.id, d.name])));
	/** The links this person can follow: to diagrams they can see. */
	const zooms = $derived(node.zooms.filter(z => nameOf.has(z.diagram)));
	const linkable = $derived((diagrams ?? []).filter(d => !node.zooms.some(z => z.diagram === d.id)));
	/** What a new diagram below this node would be: the next C4 level, offered while the node zooms into nothing. */
	const below = $derived(editable && onzoomnew && kind.level && kind.child && !zooms.length ? kindOf(kind.child) : null);
	/** What a new diagram above this node would be: the C4 level up. */
	const above = $derived(editable && onzoomup && kind.parent ? kindOf(kind.parent) : null);
	let making = $state(false);
	let madeError = $state('');
	async function zoomNew(make = onzoomnew) {
		making = true;
		madeError = '';
		try {
			await make?.();
		} catch (e) {
			madeError = e instanceof Error ? e.message : 'Could not make the diagram';
		} finally {
			making = false;
		}
	}
	function linkDiagram(id: string) {
		if (id) onchange?.({ links: docLinks(node.links, [...node.zooms, { diagram: id }]) }, `Zoom into ${nameOf.get(id) ?? 'a diagram'}`);
	}
	function unlinkDiagram(id: string) {
		onchange?.({ links: docLinks(node.links, node.zooms.filter(z => z.diagram !== id)) }, `Stop zooming into ${nameOf.get(id) ?? 'a diagram'}`);
	}
	const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

	function typed(field: 'name' | 'subtitle' | 'notes', label: string) {
		return (e: Event) => onchange?.({ [field]: (e.currentTarget as HTMLInputElement).value }, label, `${node.id}:${field}`);
	}
	function nameDone(e: FocusEvent) {
		// A node keeps a name: left blank, it takes its type's.
		if (!(e.currentTarget as HTMLInputElement).value.trim()) onchange?.({ name: node.type }, 'Rename node', `${node.id}:name`);
		onfieldend?.();
	}
	function toggleFlag(id: string, label: string) {
		const on = node.flags.includes(id);
		onchange?.({ flags: on ? node.flags.filter(f => f !== id) : [...node.flags, id] }, `${on ? 'Unflag' : 'Flag'} ${label.toLowerCase()}`);
	}
	function addLink(e?: SubmitEvent) {
		e?.preventDefault();
		if (!linkAddress.trim()) return;
		onchange?.({ links: docLinks([...node.links, { ...(linkLabel.trim() ? { label: linkLabel.trim() } : {}), url: linkUrl(linkAddress) }], node.zooms) }, 'Add link');
		linkLabel = '';
		linkAddress = '';
	}
</script>

{#snippet edges()}
	{#if connections.length}
		<h3>Connections</h3>
		<ul class="edges">
			{#each connections as c (c.index)}
				<li>
					<button type="button" onclick={() => onpickedge?.(c.index)}>
						<span class="dir">{c.out ? '→' : '←'}</span>
						<span class="other">{c.name}</span>
						{#if c.label}<span class="e-label">{c.label}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet zoomIn()}
	{#if zooms.length || below || (editable && linkable.length)}
		<h3>Zoom in</h3>
		{#if zooms.length}
			<ul class="zooms">
				{#each zooms as z (z.diagram)}
					<li>
						<button type="button" class="btn btn-secondary zoom" onclick={() => onzoom?.(z)}>
							<Icon name="magnifyingGlassPlus" size={14} /><span class="z-name">{z.label || nameOf.get(z.diagram)}</span>{#if z.view}<span class="z-view">{z.view}</span>{/if}
						</button>
						{#if editable}
							<button type="button" class="x" aria-label="Stop zooming into {nameOf.get(z.diagram)}" onclick={() => unlinkDiagram(z.diagram)}>×</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if below}
			<button type="button" class="btn btn-secondary zoom" disabled={making} onclick={() => zoomNew()}>
				<Icon name="magnifyingGlassPlus" size={14} /><span class="z-name">New {below.label} diagram</span>
			</button>
			{#if madeError}<p class="error" role="alert">{madeError}</p>{/if}
		{/if}
		{#if editable && linkable.length}
			<select class="input" aria-label="Link a diagram to zoom into" value="" onchange={e => linkDiagram(e.currentTarget.value)}>
				<option value="">Link a diagram to zoom into…</option>
				{#each linkable as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
			</select>
		{/if}
	{/if}
{/snippet}

{#snippet zoomOut()}
	{#if above}
		<h3>Zoom out</h3>
		<button type="button" class="btn btn-secondary zoom" disabled={making} onclick={() => zoomNew(onzoomup)}>
			<Icon name="treeStructure" size={14} /><span class="z-name">New {above.label} diagram above</span>
		</button>
	{/if}
{/snippet}

{#snippet links()}
	{#if node.links.length}
		<h3>Links</h3>
		<ul class="links">
			{#each node.links as l, i (i)}
				<li>
					<a href={href(l.url)} target="_blank" rel="noopener noreferrer">{l.label || hostOf(l.url)}</a>
					{#if editable}
						<button type="button" class="x" aria-label="Remove link {l.label || hostOf(l.url)}" onclick={() => onchange?.({ links: docLinks(node.links.filter((_, j) => j !== i), node.zooms) }, 'Remove link')}>×</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<section class="inspector" class:editable aria-label="Selected node">
	{#if editable}
		<label class="sr" for="node-name">Name</label>
		<input id="node-name" class="input name" value={node.name} placeholder="Name" oninput={typed('name', 'Rename node')} onblur={nameDone} />
		<label class="sr" for="node-sub">Subtitle</label>
		<input id="node-sub" class="input" value={node.sub} placeholder="Subtitle: owner, replicas, region…" oninput={typed('subtitle', 'Edit subtitle')} onblur={() => onfieldend?.()} />
		<label class="sr" for="node-notes">Notes</label>
		<textarea id="node-notes" class="input notes" rows="3" value={node.desc} placeholder="What this does, and anything worth knowing." oninput={typed('notes', 'Edit notes')} onblur={() => onfieldend?.()}></textarea>

		<h3>Type</h3>
		<button type="button" class="type-btn" aria-expanded={picking} onclick={() => (picking = !picking)}>
			<Icon name={node.icon} size={15} />
			<span>{node.type}</span>
			<Icon name="caretDown" size={11} />
		</button>
		{#if picking}
			<div class="pick">
				<TypePicker
					{cats}
					{kind}
					current={node.type}
					autofocus
					onpick={t => {
						picking = false;
						if (t !== node.type) onchange?.({ type: t }, 'Change type');
					}}
				/>
			</div>
		{/if}

		<h3>Icon</h3>
		<div class="icon-row">
			<button type="button" class="type-btn" aria-expanded={pickingIcon} aria-label="Icon: {ICON_LIBRARY[node.icon]?.label ?? node.icon}" onclick={() => (pickingIcon = !pickingIcon)}>
				<Icon name={node.icon} size={15} />
				<span>{node.ownIcon ? (ICON_LIBRARY[node.icon]?.label ?? node.icon) : 'The type’s icon'}</span>
				<Icon name="caretDown" size={11} />
			</button>
			{#if node.ownIcon}
				<button type="button" class="btn btn-ghost reset" onclick={() => onchange?.({ icon: null }, 'Use the type’s icon')}>Use the type’s</button>
			{/if}
		</div>
		{#if pickingIcon}
			<div class="pick">
				<IconPicker
					current={node.ownIcon}
					autofocus
					onpick={i => {
						pickingIcon = false;
						if (i !== node.ownIcon) onchange?.({ icon: i }, 'Change icon');
					}}
				/>
			</div>
		{/if}

		<h3>Flags</h3>
		<div class="chips">
			{#each FLAGS as f (f.id)}
				<button type="button" class="chip" class:on={node.flags.includes(f.id)} aria-pressed={node.flags.includes(f.id)} onclick={() => toggleFlag(f.id, f.label)}>
					<Icon name={f.icon} size={12} />{f.label}
				</button>
			{/each}
		</div>

		<h3>Tags</h3>
		<div class="chips" data-tour="tags">
			{#each node.tags as key (key)}
				<span class="chip tag">
					<span class="swatch" style:background={tags[key]?.color}></span>{tags[key]?.label ?? key}
					<button type="button" class="x" aria-label="Remove tag {tags[key]?.label ?? key}" onclick={() => onchange?.({ tags: node.tags.filter(t => t !== key) }, 'Change tags')}>×</button>
				</span>
			{/each}
			{#if !naming}
				<select
					class="add-tag"
					aria-label="Add a tag"
					value=""
					onchange={e => {
						const key = e.currentTarget.value;
						e.currentTarget.value = '';
						if (key === '+new') naming = true;
						else if (key) onchange?.({ tags: [...node.tags, key] }, 'Change tags');
					}}
				>
					<option value="" disabled>+ Tag</option>
					{#each addable as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
					{#if onnewtag}<option value="+new">New tag…</option>{/if}
				</select>
			{/if}
		</div>
		{#if naming}
			<form class="new-tag" onsubmit={newTag}>
				<!-- svelte-ignore a11y_autofocus -->
				<input class="input" aria-label="New tag name" placeholder="New tag name…" autofocus bind:value={tagName} onkeydown={e => e.key === 'Escape' && (naming = false)} />
				<button type="submit" class="btn btn-secondary" disabled={!tagName.trim()}>Add</button>
				<button type="button" class="btn btn-ghost" onclick={() => (naming = false)}>Cancel</button>
			</form>
		{/if}

		{@render zoomIn()}
		{@render zoomOut()}
		{#if madeError && !below}<p class="error" role="alert">{madeError}</p>{/if}
		{@render links()}
		<!-- A link typed but not added is added anyway once focus leaves the form: on a phone the first tap on Add link
		     often only puts the keyboard away, and closing the sheet then would lose what was typed. -->
		<form
			class="link-form"
			onsubmit={addLink}
			onfocusout={e => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) addLink();
			}}
		>
			<input class="input" aria-label="Link label" placeholder="Label" bind:value={linkLabel} />
			<input class="input" aria-label="Link address" placeholder="https://…" inputmode="url" bind:value={linkAddress} />
			<button type="submit" class="btn btn-secondary" disabled={!linkAddress.trim()}>Add link</button>
		</form>

		{@render edges()}

		<div class="actions">
			{#if onisolate && node.tags.length}<button type="button" class="btn btn-secondary" onclick={onisolate}>Isolate its tags</button>{/if}
			<button type="button" class="btn btn-secondary" onclick={() => onduplicate?.()}>Duplicate</button>
			<button type="button" class="btn btn-secondary danger" onclick={() => ondelete?.()}><Icon name="trash" size={14} />Delete node</button>
		</div>
	{:else}
		<p class="type">{node.type}</p>
		<h2>{node.name}</h2>
		{#if node.sub}<p class="sub">{node.sub}</p>{/if}
		{#if node.flags.length}
			<p class="flags">{FLAGS.filter(f => node.flags.includes(f.id)).map(f => f.label).join(' · ')}</p>
		{/if}
		{#if node.tags.length}
			<ul class="tags">
				{#each node.tags as key (key)}
					<li><span class="swatch" style:background={tags[key]?.color}></span>{tags[key]?.label ?? key}</li>
				{/each}
			</ul>
		{/if}
		{#if node.desc}<p class="desc">{node.desc}</p>{/if}
		{@render zoomIn()}
		{@render links()}
		{@render edges()}
		{#if onisolate && node.tags.length}
			<div class="actions"><button type="button" class="btn btn-secondary" onclick={onisolate}>Isolate its tags</button></div>
		{/if}
	{/if}
</section>

<style>
	.error {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--color-danger, #e5484d);
	}
	.zooms {
		list-style: none;
		margin: 8px 0 6px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.zooms li {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.zooms .zoom {
		margin-top: 0;
	}
	/* The size of the "Link a diagram to zoom into" dropdown beside it: full width, one line, the same height. */
	.zoom {
		flex: 1;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		height: 29px;
		justify-content: flex-start;
		gap: 6px;
		margin-top: 8px;
		padding-block: 0;
		font-size: 12.5px;
		text-align: left;
	}
	.zoom + .input,
	.zooms + .input {
		margin-top: 6px;
	}
	.z-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.z-view {
		margin-left: auto;
		font-size: 11px;
		color: var(--color-neutral-500);
	}
	.inspector {
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-divider);
	}
	.type {
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
		margin: 0;
	}
	h2 {
		font-family: var(--font-heading);
		font-size: 16px;
		font-weight: 500;
		margin: 4px 0 0;
	}
	.sub,
	.flags {
		font-size: 12px;
		color: var(--color-neutral-500);
		margin: 3px 0 0;
	}
	.flags {
		color: var(--color-accent-300);
	}
	ul {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tags li,
	.chip {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid var(--color-divider);
	}
	.swatch {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}
	.desc {
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--color-neutral-300);
		margin: 12px 0 0;
		text-wrap: pretty;
	}
	h3 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 14px 0 0;
	}
	.links {
		flex-direction: column;
		gap: 4px;
		margin-top: 6px;
		font-size: 12.5px;
	}
	.links li {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.links a {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.edges {
		flex-direction: column;
		gap: 2px;
		margin-top: 6px;
	}
	.edges button {
		width: 100%;
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-height: 30px;
		padding: 4px 6px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--color-neutral-300);
		font: inherit;
		font-size: 12.5px;
		text-align: left;
		cursor: pointer;
	}
	.edges button:hover {
		background: color-mix(in srgb, var(--color-text) 7%, transparent);
	}
	.edges .dir {
		color: var(--color-accent);
	}
	.edges .other {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.edges .e-label {
		font-size: 11px;
		color: var(--color-neutral-500);
	}

	/* ---- editing ---- */
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.editable .input {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 0;
		padding: 5px 8px;
		font-size: 12.5px;
		margin-top: 5px;
	}
	.editable .input.name {
		margin-top: 0;
		font-family: var(--font-heading);
		font-size: 16px;
		font-weight: 500;
	}
	.editable .notes {
		min-height: 64px;
		line-height: 1.5;
		font-family: var(--font-body);
	}
	.icon-row {
		display: flex;
		gap: 6px;
		align-items: center;
		margin-top: 6px;
	}
	.icon-row .type-btn {
		flex: 1;
		min-width: 0;
		margin-top: 0;
	}
	.reset {
		flex: none;
		font-size: 12px;
	}
	.type-btn {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
		padding: 7px 9px;
		min-height: 36px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.type-btn span {
		flex: 1;
		text-align: left;
	}
	.type-btn :global(svg:first-child) {
		color: var(--color-accent);
	}
	.pick {
		margin-top: 6px;
		padding: 8px;
		border: 1px solid var(--color-divider);
		border-radius: 8px;
		max-height: 320px;
		overflow-y: auto;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	button.chip {
		min-height: 30px;
		background: transparent;
		color: var(--color-neutral-400);
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	button.chip.on {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		color: var(--color-accent-100);
	}
	.chip.tag {
		padding-right: 2px;
	}
	.x {
		width: 24px;
		height: 24px;
		flex: none;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--color-neutral-500);
		font-size: 15px;
		line-height: 1;
		cursor: pointer;
	}
	.x:hover {
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.add-tag {
		/* Safari draws a native select as a white pill; this one should look like the other chips. */
		-webkit-appearance: none;
		appearance: none;
		min-height: 30px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px dashed var(--color-neutral-700);
		background: transparent;
		color: var(--color-neutral-400);
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	.add-tag option {
		background: var(--color-surface);
		color: var(--color-text);
	}
	.new-tag {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}
	.new-tag .input {
		flex: 1;
		margin-top: 0;
	}
	.new-tag .btn {
		flex: none;
		font-size: 12px;
		padding: 4px 9px;
	}
	.link-form {
		display: grid;
		grid-template-columns: 1fr 1.6fr;
		gap: 0 6px;
		margin-top: 8px;
	}
	.link-form .btn {
		grid-column: 1 / -1;
		margin-top: 6px;
		font-size: 12.5px;
		padding: 5px 10px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 18px;
	}
	.actions .btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font-size: 12.5px;
		padding: 6px 8px;
		white-space: nowrap;
	}
	.danger:hover {
		color: var(--color-danger, #e5767b);
		border-color: currentColor;
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.editable .input,
		.editable .input.name,
		.add-tag {
			font-size: 16px;
		}
	}
</style>
