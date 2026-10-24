// Shapes the Worker's API returns (worker/src/*.ts). Field names follow the JSON, not the tables.

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

export interface Diagram extends DiagramSummary {
	doc: SkopeDoc;
}

export interface Snapshot {
	id: string;
	label: string;
	authorEmail: string;
	doc: SkopeDoc;
	createdAt: number;
}

// ---- the .skope.json document, version 1 (web/index.html buildConfig) ----

export interface DocTag {
	label: string;
	color: string;
	group?: string;
}

export interface DocNode {
	id: string;
	name: string;
	type: string;
	subtitle?: string;
	flags?: string[];
	tags?: string[];
	layout?: { x: number; y: number; w?: number; h?: number };
	notes?: string;
	links?: { label?: string; url: string }[];
}

export interface DocEdge {
	from: string;
	to: string;
	label?: string;
	showLabel?: boolean;
	line?: 'solid' | 'dashed' | 'dotted';
	direction?: 'forward' | 'back' | 'both' | 'none';
	width?: number;
	route?: 'curved' | 'straight' | 'angled';
	anchors?: { from?: string; to?: string };
}

export interface DocBoundary {
	id: string;
	label?: string;
	border?: { width?: number; style?: 'solid' | 'dashed' | 'dotted' };
	moveContents?: boolean;
	layout?: { x: number; y: number; w: number; h: number };
	labelPosition?: string;
}

export interface SkopeDoc {
	version: 1;
	diagram?: { id?: string; name?: string; kind?: string; view?: string };
	tags?: Record<string, DocTag>;
	views?: { name: string; tags: string[] }[];
	nodes?: DocNode[];
	edges?: DocEdge[];
	boundaries?: DocBoundary[];
}
