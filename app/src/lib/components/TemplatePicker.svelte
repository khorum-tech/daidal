<script lang="ts">
	import { SHEET_H, SHEET_W } from '@khorum-oss/daidal-core/model';
	import { cardSummary } from '@khorum-oss/daidal-core/summary';
	import { TEMPLATES } from '@khorum-oss/daidal-core/templates';

	/**
	 * The prototype's template gallery, as a choice in the new-diagram form: a blank canvas or one of the templates,
	 * each with a thumbnail of its example nodes. [examples] keeps those nodes; without it a template brings its tags,
	 * views and kind to an empty canvas.
	 */
	let {
		picked = $bindable(null),
		examples = $bindable(false)
	}: {
		/** The template's id, or null for a blank canvas. */
		picked?: string | null;
		examples?: boolean;
	} = $props();

	const choices = [
		{ id: null, name: 'Blank', desc: 'An empty canvas, ready for + Add.', kind: '', boxes: [] as number[][], frames: [] as number[][] },
		...TEMPLATES.map(t => {
			const s = cardSummary(t.doc);
			return { id: t.id as string | null, name: t.name, desc: t.desc, kind: s.kind, boxes: s.boxes, frames: s.frames };
		})
	];
</script>

<div class="picker">
	<div class="choices" role="radiogroup" aria-label="Start from">
		{#each choices as c (c.id ?? 'blank')}
			<button type="button" role="radio" class="choice" aria-checked={picked === c.id} onclick={() => (picked = c.id)}>
				<span class="thumb" aria-hidden="true">
					<svg viewBox="0 0 {SHEET_W} {SHEET_H}">
						{#each c.frames as [x, y, w, h], i (i)}<rect {x} {y} width={w} height={h} rx="18" fill="none" stroke-dasharray="12 12" class="b" />{/each}
						{#each c.boxes as [x, y, w, h], i (i)}<rect {x} {y} width={w} height={h} rx="14" class="n" />{/each}
					</svg>
				</span>
				<span class="text">
					<span class="name">{c.name}{#if c.kind}<span class="tag tag-neutral kind">{c.kind}</span>{/if}</span>
					<span class="desc">{c.desc}</span>
				</span>
			</button>
		{/each}
	</div>
	{#if picked}
		<label class="switch">
			<input type="checkbox" bind:checked={examples} />
			Include the example nodes
		</label>
		<p class="note">Its tags and saved views come either way.</p>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px;
	}
	.choice {
		display: flex;
		flex-direction: column;
		padding: 0;
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		color: var(--color-text);
		font: inherit;
		text-align: left;
		overflow: hidden;
		cursor: pointer;
	}
	.choice:hover {
		border-color: var(--color-neutral-600);
	}
	.choice[aria-checked='true'] {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 1px var(--color-accent);
	}
	.thumb {
		display: block;
		height: 64px;
		border-bottom: 1px solid var(--color-divider);
	}
	.thumb svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.b {
		stroke: var(--color-neutral-800);
		stroke-width: 3;
	}
	.n {
		fill: var(--color-neutral-800);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 8px 10px 10px;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		font-weight: 500;
	}
	.kind {
		font-size: 9.5px;
		padding: 0 6px;
	}
	.desc {
		font-size: 11px;
		line-height: 1.4;
		color: var(--color-neutral-500);
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.switch input {
		accent-color: var(--color-accent);
		width: 16px;
		height: 16px;
		margin: 0;
	}
	.note {
		margin: 0;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
</style>
