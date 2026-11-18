<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import DiagramCard from './DiagramCard.svelte';
	import { SAMPLE } from '@khorum-oss/daidal-core/fixtures';
	import { cardSummary } from '@khorum-oss/daidal-core/summary';
	import type { ListedDiagram } from '../types';

	const NOW = Date.parse('2026-10-24T12:00:00Z');
	const diagram: ListedDiagram = {
		id: 'd1',
		workspaceId: 'w',
		ownerEmail: 'rowan@example.com',
		name: 'checkout',
		summary: cardSummary(SAMPLE),
		leadName: null,
		rev: 3,
		leadId: null,
		syncedSnapshotId: null,
		decided: {},
		paused: false,
		updatedAt: NOW - 3 * 3_600_000
	};

	const { Story } = defineMeta({
		title: 'Diagram/Card',
		component: DiagramCard,
		args: { diagram, href: '#', now: NOW }
	});
</script>

{#snippet narrow(args: ComponentProps<typeof DiagramCard>)}
	<div style="width:280px"><DiagramCard {...args} /></div>
{/snippet}

<Story name="Standalone" template={narrow} />
<Story name="Following" args={{ diagram: { ...diagram, leadId: 'l', leadName: 'checkout-lead' } }} template={narrow} />
<Story name="Lead out of reach, paused" args={{ diagram: { ...diagram, leadId: 'l', paused: true } }} template={narrow} />
