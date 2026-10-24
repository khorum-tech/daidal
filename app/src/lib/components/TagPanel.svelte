<script lang="ts">
	import { tagGroups, type Scene } from '../diagram/model';

	/**
	 * Views and tags, as the prototype's left panel lists them. Switching a tag off only changes what this browser
	 * shows; nothing is saved.
	 */
	let {
		scene,
		on,
		view,
		onview,
		ontoggle
	}: {
		scene: Scene;
		on: Record<string, boolean>;
		view: string | null;
		onview: (view: string | null) => void;
		ontoggle: (tag: string) => void;
	} = $props();

	const groups = $derived(tagGroups(scene));
	const count = (key: string) => scene.nodes.filter(n => n.tags.includes(key)).length;
</script>

<aside class="panel" aria-label="Views and tags">
	{#if scene.views.length}
		<section>
			<h2>Views</h2>
			<ul class="views">
				<li>
					<button type="button" class:active={view === null} aria-pressed={view === null} onclick={() => onview(null)}>Everything</button>
				</li>
				{#each scene.views as v (v.label)}
					<li>
						<button type="button" class:active={view === v.label} aria-pressed={view === v.label} onclick={() => onview(v.label)}>{v.label}</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
	{#each groups as g (g.name)}
		<section>
			<h2>{g.name}</h2>
			<ul class="tags">
				{#each g.tags as t (t.key)}
					<li>
						<label class:off={!on[t.key]}>
							<input type="checkbox" checked={on[t.key]} onchange={() => ontoggle(t.key)} />
							<span class="swatch" style:background={t.color}></span>
							<span class="label">{t.label}</span>
							<span class="count">{count(t.key)}</span>
						</label>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="empty">This diagram has no tags.</p>
	{/each}
</aside>

<style>
	.panel {
		width: 232px;
		flex: none;
		overflow-y: auto;
		border-right: 1px solid var(--color-divider);
		padding: 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
		font-weight: 500;
		margin: 0 4px 6px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.views button {
		width: 100%;
		text-align: left;
		font: inherit;
		font-size: 12.5px;
		padding: 6px 8px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-neutral-400);
		cursor: pointer;
	}
	.views button:hover {
		background: color-mix(in srgb, var(--color-text) 6%, transparent);
	}
	.views button.active {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 7px;
		font-size: 12.5px;
		cursor: pointer;
	}
	label:hover {
		background: color-mix(in srgb, var(--color-text) 6%, transparent);
	}
	label.off .label,
	label.off .swatch {
		opacity: 0.45;
	}
	input {
		accent-color: var(--color-accent);
		margin: 0;
	}
	.swatch {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex: none;
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		font-size: 11px;
		color: var(--color-neutral-600);
	}
	.empty {
		font-size: 12px;
		color: var(--color-neutral-600);
		margin: 0 4px;
	}
</style>
