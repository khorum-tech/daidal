<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FollowPanel from './FollowPanel.svelte';
	import { pending } from '../diagram/review';
	import { SAMPLE } from '@khorum-oss/daidal-core/fixtures';
	import type { DaidalDoc } from '../types';

	const before: DaidalDoc = { ...SAMPLE, nodes: SAMPLE.nodes!.slice(0, 3), edges: SAMPLE.edges!.slice(0, 1) };
	const groups = pending(
		[
			{ id: 's1', label: 'First cut', authorEmail: 'lead@example.com', doc: before, createdAt: Date.now() - 86_400_000 * 3 },
			{ id: 's2', label: 'Add telemetry and notes', authorEmail: 'lead@example.com', doc: SAMPLE, createdAt: Date.now() - 3_600_000 }
		],
		's1'
	);

	const { Story } = defineMeta({
		title: 'Diagram/Follow panel',
		component: FollowPanel,
		args: { leadName: 'checkout', leadHref: '#', groups, decided: {}, paused: false }
	});
</script>

<Story name="Read-only" />
<Story name="Editable" args={{ editable: true }} />
<Story name="Some decided" args={{ editable: true, decided: Object.fromEntries(groups[0].changes.slice(0, 2).map((c, i) => [c.id, i ? 'skipped' : 'accepted'])) }} />
<Story name="Up to date, paused" args={{ editable: true, groups: [], paused: true }} />
