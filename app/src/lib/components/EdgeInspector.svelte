<script lang="ts">
	import type { SceneEdge, Side } from '@khorum/daidal-core/model';
	import type { EdgeChange, EndSide } from '@khorum/daidal-core/edit';
	import Icon from './Icon.svelte';

	/**
	 * The selected connection: the prototype's connection inspector. Read-only unless [editable]; then the label edits
	 * in place (one undo step per visit, like the node fields) and the rest change with a tap. Each end can leave
	 * from the side facing the other node (auto) or be pinned to a side.
	 */
	let {
		edge,
		fromName,
		toName,
		editable = false,
		defaultRoute = 'curved',
		onchange,
		onfieldend,
		onreverse,
		ondelete
	}: {
		edge: SceneEdge;
		fromName: string;
		toName: string;
		editable?: boolean;
		defaultRoute?: 'curved' | 'straight' | 'angled';
		onchange?: (change: EdgeChange, label: string, group?: string) => void;
		onfieldend?: () => void;
		onreverse?: () => void;
		ondelete?: () => void;
	} = $props();

	const ARROWS = { forward: '→', back: '←', both: '↔', none: '—' } as const;
	const DIRS: { v: SceneEdge['dir']; title: string }[] = [
		{ v: 'forward', title: 'Arrow at the target' },
		{ v: 'back', title: 'Arrow at the source' },
		{ v: 'both', title: 'Arrows at both ends' },
		{ v: 'none', title: 'No arrowheads' }
	];
	const WIDTHS: [string, number][] = [
		['Thin', 0.9],
		['Medium', 1.4],
		['Thick', 2.6]
	];
	const STYLES: [string, SceneEdge['style'], string][] = [
		['Solid', 'solid', ''],
		['Dashed', 'dashed', '5 4'],
		['Dotted', 'dotted', '1 3']
	];
	const ROUTES: [string, 'curved' | 'straight' | 'angled', string][] = [
		['Curved', 'curved', 'M1,16 C12,16 14,4 25,4'],
		['Straight', 'straight', 'M1,16 L25,4'],
		['Angled', 'angled', 'M1,16 L13,16 L13,4 L25,4']
	];
	const SIDE_NAME: Record<Side, EndSide> = { l: 'left', r: 'right', t: 'top', b: 'bottom' };
	const SIDES: EndSide[] = ['left', 'right', 'top', 'bottom'];

	const route = $derived(edge.route ?? defaultRoute);
	const sideOf = (a: SceneEdge['fromA']) => (a ? SIDE_NAME[a.side] : '');
	const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
</script>

{#snippet choice(active: boolean, label: string, title: string, set: () => void, preview?: import('svelte').Snippet)}
	<button type="button" class="opt" class:on={active} aria-pressed={active} {title} aria-label={title} onclick={set}>
		{#if preview}{@render preview()}{:else}{label}{/if}
	</button>
{/snippet}

<section class="inspector" class:editable aria-label="Selected connection">
	<p class="kind">Connection</p>
	<h2>{fromName} <span class="arrow">{ARROWS[edge.dir]}</span> {toName}</h2>

	{#if editable}
		<label class="sr" for="edge-label">Label</label>
		<input
			id="edge-label"
			class="input"
			value={edge.label}
			placeholder="Label this connection"
			oninput={e => onchange?.({ label: e.currentTarget.value }, 'Edit connection label', `edge${edge.index}:label`)}
			onblur={() => onfieldend?.()}
		/>
		<label class="switch">
			<input type="checkbox" checked={edge.showLabel} onchange={() => onchange?.({ showLabel: !edge.showLabel }, edge.showLabel ? 'Hide label' : 'Show label')} />
			Show the label on the canvas
		</label>

		<h3>Arrows</h3>
		<div class="row">
			{#each DIRS as d (d.v)}
				{@render choice(edge.dir === d.v, ARROWS[d.v], d.title, () => onchange?.({ direction: d.v }, 'Change arrows'))}
			{/each}
		</div>

		<h3>Weight</h3>
		<div class="row">
			{#each WIDTHS as [label, w] (label)}
				{@render choice(Math.abs(edge.weight - w) < 0.3, label, `${label} line`, () => onchange?.({ width: w }, 'Change weight'))}
			{/each}
		</div>

		<h3>Line</h3>
		<div class="row">
			{#each STYLES as [label, v, dash] (v)}
				{#snippet line()}
					<svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="currentColor" stroke-width="1.6" stroke-dasharray={dash || undefined} stroke-linecap="round" /></svg>
				{/snippet}
				{@render choice(edge.style === v, label, `${label} line`, () => onchange?.({ line: v }, 'Change line'), line)}
			{/each}
		</div>

		<h3>Route</h3>
		<div class="row">
			{#each ROUTES as [label, v, d] (v)}
				{#snippet path()}
					<svg width="26" height="20" aria-hidden="true"><path {d} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
				{/snippet}
				{@render choice(route === v, label, `${label} route`, () => onchange?.({ route: v }, 'Change route'), path)}
			{/each}
		</div>

		<h3>Ends</h3>
		<div class="ends">
			{#each [['from', fromName, edge.fromA], ['to', toName, edge.toA]] as const as [end, name, anchor] (end)}
				<label>
					<span>{end === 'from' ? 'Leaves' : 'Arrives at'} {name}</span>
					<select
						aria-label="{end === 'from' ? 'Side it leaves' : 'Side it arrives at'} {name}"
						value={sideOf(anchor)}
						onchange={e => {
							const side = (e.currentTarget.value || null) as EndSide | null;
							onchange?.(end === 'from' ? { fromSide: side } : { toSide: side }, side ? `Pin ${end === 'from' ? 'start' : 'end'} to the ${side}` : 'Unpin an end');
						}}
					>
						<option value="">Auto: the facing side</option>
						{#each SIDES as side (side)}<option value={side}>{cap(side)} side</option>{/each}
					</select>
				</label>
			{/each}
		</div>

		<div class="actions">
			<button type="button" class="btn btn-secondary" onclick={() => onreverse?.()}>Reverse</button>
			<button type="button" class="btn btn-secondary danger" aria-label="Delete connection" onclick={() => ondelete?.()}><Icon name="trash" size={14} />Delete</button>
		</div>
	{:else if edge.label}
		<p class="label">{edge.label}</p>
	{/if}
</section>

<style>
	.inspector {
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-divider);
	}
	.kind {
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
		margin: 0;
	}
	h2 {
		font-family: var(--font-heading);
		font-size: 15px;
		font-weight: 500;
		margin: 4px 0 0;
		overflow-wrap: anywhere;
	}
	.arrow {
		color: var(--color-accent);
	}
	.label {
		font-size: 12.5px;
		color: var(--color-neutral-300);
		margin: 6px 0 0;
	}
	h3 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 14px 0 0;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.input {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 0;
		margin-top: 10px;
		padding: 5px 8px;
		font-size: 12.5px;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 12px;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.switch input {
		accent-color: var(--color-accent);
		width: 16px;
		height: 16px;
		margin: 0;
	}
	.row {
		display: flex;
		gap: 5px;
		margin-top: 6px;
	}
	.opt {
		flex: 1;
		min-width: 0;
		min-height: 34px;
		display: grid;
		place-items: center;
		padding: 4px 6px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-neutral-400);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.opt:hover {
		border-color: var(--color-accent-700);
	}
	.opt.on {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		color: var(--color-accent-100);
	}
	.ends {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 6px;
	}
	.ends label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.ends span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	select {
		-webkit-appearance: none;
		appearance: none;
		min-height: 32px;
		padding: 4px 8px;
		border-radius: 7px;
		border: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	select option {
		background: var(--color-surface);
		color: var(--color-text);
	}
	.actions {
		display: flex;
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
		.input,
		select {
			font-size: 16px;
		}
	}
</style>
