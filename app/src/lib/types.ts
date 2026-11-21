// Shapes the Worker's API returns (worker/src/*.ts). Field names follow the JSON, not the tables. The document
// itself and the shapes shared with it live in the core package and are re-exported here.
import type { CardSummary, CustomType, DaidalDoc } from '@khorum/daidal-core/types';

export type {
	CardSummary,
	CustomType,
	DaidalDoc,
	DocBoundary,
	DocEdge,
	DocNode,
	DocTag,
	NodeLink
} from '@khorum/daidal-core/types';

export interface Me {
	email: string;
	name: string;
	title: string;
	settings: Record<string, unknown>;
}

export interface Workspace {
	id: string;
	name: string;
	ownerEmail: string;
	personal: boolean;
	members: string[];
	/** The workspace's own node types. */
	types: CustomType[];
}

/** A personal access token as listed: never its secret, which is shown once when it's made. */
export interface AccessToken {
	id: string;
	name: string;
	scope: 'read' | 'write';
	/** The workspaces it may reach, or null for all of yours. */
	workspaces: string[] | null;
	createdAt: string;
	lastUsedAt: string | null;
}

/** A diagram as listed: everything but the document. */
export interface DiagramSummary {
	id: string;
	workspaceId: string;
	ownerEmail: string;
	name: string;
	rev: number;
	leadId: string | null;
	syncedSnapshotId: string | null;
	decided: Record<string, string>;
	paused: boolean;
	updatedAt: number;
}

/** A diagram as the list returns it: with its card summary and, for a follower, its lead's name if it can be seen. */
export interface ListedDiagram extends DiagramSummary {
	summary: CardSummary;
	leadName: string | null;
}

export interface Diagram extends DiagramSummary {
	doc: DaidalDoc;
}

export interface Snapshot {
	id: string;
	label: string;
	authorEmail: string;
	doc: DaidalDoc;
	createdAt: number;
}
