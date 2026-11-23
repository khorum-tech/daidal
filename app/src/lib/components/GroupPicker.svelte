<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * Picks the group a diagram is filed under in its workspace: one of the groups in use, a new one by name, or none.
	 * Groups are flat labels; a new one exists as soon as a diagram is filed under it. Each choice reports at once.
	 */
	let {
		groups,
		value,
		onpick,
		disabled = false
	}: {
		/** The workspace's groups, by name. */
		groups: string[];
		/** The diagram's group now, or null. */
		value: string | null;
		onpick: (group: string | null) => void;
		disabled?: boolean;
	} = $props();

	let fresh = $state('');
	const known = $derived(groups.some(g => g.toLowerCase() === fresh.trim().toLowerCase()));
	function add(e: SubmitEvent) {
		e.preventDefault();
		const name = fresh.trim();
		if (!name) return;
		// Typing a group in use (in any case) picks that one, so the same set doesn't split in two.
		onpick(groups.find(g => g.toLowerCase() === name.toLowerCase()) ?? name);
		fresh = '';
	}
</script>

<div class="group-picker">
	<div class="chips" role="radiogroup" aria-label="Group">
		<button type="button" class="chip" role="radio" aria-checked={value === null} {disabled} onclick={() => onpick(null)}>No group</button>
		{#each groups as g (g)}
			<button type="button" class="chip" role="radio" aria-checked={value === g} {disabled} onclick={() => onpick(g)}>
				<Icon name="folder" size={13} /><span>{g}</span>
			</button>
		{/each}
	</div>
	<form class="new" onsubmit={add}>
		<input class="input" maxlength="100" placeholder="New group, e.g. Ledger C4" aria-label="New group" bind:value={fresh} {disabled} />
		<button type="submit" class="btn btn-secondary" disabled={disabled || !fresh.trim()}>{known ? 'Use' : 'Add'}</button>
	</form>
</div>

<style>
	.group-picker {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		max-width: 100%;
		min-height: 32px;
		padding: 4px 11px;
		border: 1px solid var(--color-divider);
		border-radius: 999px;
		background: transparent;
		color: var(--color-neutral-300);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.chip span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip:hover:not(:disabled) {
		border-color: var(--color-neutral-600);
		color: var(--color-text);
	}
	.chip[aria-checked='true'] {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		color: var(--color-text);
	}
	.new {
		display: flex;
		gap: 6px;
	}
	.new .input {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		min-height: 34px;
		padding: 5px 9px;
		font-size: 13px;
	}
	.new .btn {
		flex: none;
		font-size: 12.5px;
	}
	/* Safari on iOS zooms the page into any field set smaller than 16px. */
	@media (pointer: coarse) {
		.new .input {
			font-size: 16px;
		}
		.chip {
			min-height: 36px;
		}
	}
</style>
