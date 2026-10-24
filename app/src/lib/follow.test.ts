import { describe, expect, it } from 'vitest';
import { followState } from './follow';
import type { DiagramSummary, Snapshot } from './types';

const d = (over: Partial<DiagramSummary> = {}): DiagramSummary => ({
	id: 'f',
	workspaceId: 'w',
	ownerEmail: 'me@example.com',
	name: 'copy',
	rev: 1,
	leadId: 'lead',
	syncedSnapshotId: 's1',
	decided: {},
	paused: false,
	updatedAt: 0,
	...over
});
const snap = (id: string): Snapshot => ({ id, label: `label ${id}`, authorEmail: 'x@example.com', doc: { version: 1 }, createdAt: 0 });
const lead = { name: 'edge-ingress', snapshots: [snap('s0'), snap('s1'), snap('s2'), snap('s3')] };

describe('followState', () => {
	it('is none for a diagram that follows nothing', () => {
		expect(followState(d({ leadId: null }), null)).toEqual({ kind: 'none' });
	});

	it('is gone when the lead cannot be loaded', () => {
		expect(followState(d(), null)).toEqual({ kind: 'gone' });
	});

	it('counts the snapshots after the synced one', () => {
		expect(followState(d(), lead)).toEqual({ kind: 'following', leadId: 'lead', leadName: 'edge-ingress', syncedLabel: 'label s1', newer: 2, paused: false });
		expect(followState(d({ syncedSnapshotId: 's3', paused: true }), lead)).toMatchObject({ newer: 0, paused: true });
	});

	it('counts every snapshot when it was never synced, or synced to one that no longer exists', () => {
		expect(followState(d({ syncedSnapshotId: null }), lead)).toMatchObject({ syncedLabel: null, newer: 4 });
		expect(followState(d({ syncedSnapshotId: 'gone' }), lead)).toMatchObject({ syncedLabel: null, newer: 4 });
	});
});
