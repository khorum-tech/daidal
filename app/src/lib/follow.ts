import type { DiagramSummary, Snapshot } from './types';

export type FollowState =
	| { kind: 'none' }
	/** It had a lead, but the caller can no longer see it (deleted, or they left its workspace). */
	| { kind: 'gone' }
	| { kind: 'following'; leadId: string; leadName: string; syncedLabel: string | null; newer: number; paused: boolean };

/**
 * Where a follower stands against its lead: the snapshot it is synced to and how many newer ones it hasn't
 * reviewed. Pass the lead's name and history, or null when the lead couldn't be loaded.
 */
export function followState(d: DiagramSummary, lead: { name: string; snapshots: Snapshot[] } | null): FollowState {
	if (!d.leadId) return { kind: 'none' };
	if (!lead) return { kind: 'gone' };
	const at = d.syncedSnapshotId ? lead.snapshots.findIndex(s => s.id === d.syncedSnapshotId) : -1;
	return {
		kind: 'following',
		leadId: d.leadId,
		leadName: lead.name,
		syncedLabel: at >= 0 ? lead.snapshots[at].label : null,
		newer: lead.snapshots.length - (at + 1),
		paused: d.paused
	};
}
