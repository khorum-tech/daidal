<script lang="ts">
	import type { SceneBoundary } from '@khorum/daidal-core/model';
	import type { BoundaryChange } from '@khorum/daidal-core/edit';
	import Icon from './Icon.svelte';

	/**
	 * The selected container: the prototype's container inspector. Read-only unless [editable]; then the label edits
	 * in place (one undo step per visit) and the rest change with a tap.
	 */
	let {
		box,
		editable = false,
		onchange,
		onfieldend,
		onduplicate,
		ondelete
	}: {
		box: SceneBoundary;
		editable?: boolean;
		onchange?: (change: BoundaryChange, label: string, group?: string) => void;
		onfieldend?: () => void;
		onduplicate?: () => void;
		ondelete?: () => void;
	} = $props();

	const [place, corner] = $derived(box.pos.split('-') as ['inside' | 'outside', string]);
	const CORNERS: [string, string][] = [
		['tl', 'Top left'],
		['tr', 'Top right'],
		['bl', 'Bottom left'],
		['br', 'Bottom right']
	];
	const WIDTHS: [string, number][] = [
		['Hairline', 1],
		['Regular', 1.5],
		['Medium', 2],
		['Heavy', 3]
	];
	const STYLES: SceneBoundary['bs'][] = ['solid', 'dashed', 'dotted'];
	const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
</script>

<section class="inspector" class:editable aria-label="Selected container">
	<p class="kind">Container</p>
	{#if editable}
		<label class="sr" for="box-label">Label</label>
		<input
			id="box-label"
			class="input"
			value={box.label}
			placeholder="e.g. PROD CLUSTER · US-EAST-1"
			oninput={e => onchange?.({ label: e.currentTarget.value }, 'Rename container', `box${box.id}:label`)}
			onblur={() => onfieldend?.()}
		/>
		<p class="size">{Math.round(box.w)} × {Math.round(box.h)}</p>

		<h3>Label position</h3>
		<div class="row">
			{#each ['inside', 'outside'] as const as v (v)}
				<button type="button" class="opt" class:on={place === v} aria-pressed={place === v} onclick={() => onchange?.({ labelPosition: `${v}-${corner}` }, 'Move container label')}>{cap(v)}</button>
			{/each}
		</div>
		<div class="row">
			{#each CORNERS as [v, label] (v)}
				<button type="button" class="opt corner {v}" class:on={corner === v} aria-pressed={corner === v} aria-label={label} title={label} onclick={() => onchange?.({ labelPosition: `${place}-${v}` }, 'Move container label')}>
					<span class="frame"><span class="dot"></span></span>
				</button>
			{/each}
		</div>

		<h3>Border</h3>
		<div class="row tight">
			{#each WIDTHS as [label, w] (label)}
				<button type="button" class="opt" class:on={box.bw === w} aria-pressed={box.bw === w} onclick={() => onchange?.({ borderWidth: w }, 'Change border')}>{label}</button>
			{/each}
		</div>
		<div class="row">
			{#each STYLES as v (v)}
				<button type="button" class="opt" class:on={box.bs === v} aria-pressed={box.bs === v} aria-label="{cap(v)} border" onclick={() => onchange?.({ borderStyle: v }, 'Change border')}>
					<span class="line" style:border-top="2px {v} currentColor"></span>
				</button>
			{/each}
		</div>

		<label class="switch">
			<input type="checkbox" checked={box.moveContents} onchange={() => onchange?.({ moveContents: !box.moveContents }, box.moveContents ? 'Container moves alone' : 'Container moves its contents')} />
			Moving it moves what's inside
		</label>

		<div class="actions">
			<button type="button" class="btn btn-secondary" aria-label="Duplicate container" onclick={() => onduplicate?.()}>Duplicate</button>
			<button type="button" class="btn btn-secondary danger" aria-label="Delete container" onclick={() => ondelete?.()}><Icon name="trash" size={14} />Delete</button>
		</div>
	{:else}
		<h2>{box.label || 'Untitled container'}</h2>
		<p class="size">{Math.round(box.w)} × {Math.round(box.h)}</p>
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
	.size {
		margin: 4px 0 0;
		font-size: 11.5px;
		color: var(--color-neutral-500);
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
		margin-top: 8px;
		padding: 5px 8px;
		font-size: 12.5px;
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
	.row.tight .opt {
		padding: 4px 2px;
		font-size: 11.5px;
	}
	.opt.on {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		color: var(--color-accent-100);
	}
	.frame {
		position: relative;
		width: 22px;
		height: 14px;
		border: 1px dashed currentColor;
		border-radius: 3px;
	}
	.dot {
		position: absolute;
		width: 7px;
		height: 3px;
		border-radius: 1px;
		background: currentColor;
	}
	.tl .dot {
		left: 2px;
		top: 2px;
	}
	.tr .dot {
		right: 2px;
		top: 2px;
	}
	.bl .dot {
		left: 2px;
		bottom: 2px;
	}
	.br .dot {
		right: 2px;
		bottom: 2px;
	}
	.line {
		width: 26px;
		height: 0;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
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
		.input {
			font-size: 16px;
		}
	}
</style>
