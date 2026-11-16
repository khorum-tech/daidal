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

/** A node type a workspace adds (or a built-in one it re-draws): a name, a picker category, a library icon. */
export interface CustomType {
	name: string;
	category: string;
	icon: string;
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

/**
 * What a card shows of a diagram without its document (the server works it out on every save; see
 * worker/src/summary.ts): its kind, counts, the first five tag colours, node names, its thumbnail's boxes as
 * [x, y, w, h], nodes then containers, and the diagrams its nodes zoom into.
 */
export interface CardSummary {
	kind: string;
	nodes: number;
	edges: number;
	tags: string[];
	names: string[];
	boxes: number[][];
	frames: number[][];
	/** Ids of the diagrams its nodes zoom into. Missing in a summary kept before drill-down. */
	zooms?: string[];
}

/** A diagram as the list returns it: with its card summary and, for a follower, its lead's name if it can be seen. */
export interface ListedDiagram extends DiagramSummary {
	summary: CardSummary;
	leadName: string | null;
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
	/** An icon from the library in place of the type's own. */
	icon?: string;
	subtitle?: string;
	flags?: string[];
	tags?: string[];
	layout?: { x: number; y: number; w?: number; h?: number };
	notes?: string;
	/** Web pages ({ url }) and diagrams to zoom into ({ diagram, view? }), in one list. */
	links?: NodeLink[];
	/** "<diagram id>#<node id>": this node is the same thing as that node in another diagram. */
	ref?: string;
}

/** A node's link: a web page by its url, or another diagram in the workspace (and one of its views) to zoom into. */
export interface NodeLink {
	label?: string;
	url?: string;
	diagram?: string;
	view?: string;
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
	/** "<diagram id>#<node id>": the node in another diagram this container expands (a C4 child diagram's scope). */
	ref?: string;
}

export interface SkopeDoc {
	version: 1;
	diagram?: { id?: string; name?: string; kind?: string; view?: string };
	tags?: Record<string, DocTag>;
	/** A locked view can still be shown, but not renamed, re-saved or deleted. */
	views?: { name: string; tags: string[]; locked?: boolean }[];
	nodes?: DocNode[];
	edges?: DocEdge[];
	boundaries?: DocBoundary[];
}
