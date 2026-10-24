<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HistoryPanel from './HistoryPanel.svelte';
	import type { Snapshot } from '../types';

	const NOW = Date.parse('2026-10-24T12:00:00Z');
	const snap = (id: string, label: string, days: number): Snapshot => ({ id, label, authorEmail: 'rowan@example.com', doc: { version: 1 }, createdAt: NOW - days * 86_400_000 });
	const snapshots = [snap('a', 'First sketch', 40), snap('b', 'Add the web firewall', 12), snap('c', 'Second region', 2)];

	const { Story } = defineMeta({
		title: 'Diagram/History',
		component: HistoryPanel,
		args: { snapshots, current: null, onpick: () => {}, now: NOW }
	});
</script>

<Story name="Working copy" />
<Story name="Replaying a snapshot" args={{ current: 'b' }} />
<Story name="No history" args={{ snapshots: [] }} />
