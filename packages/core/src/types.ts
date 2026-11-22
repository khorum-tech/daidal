// The .daidal.json document and the shapes that travel with it: what every Daidal client reads and writes. The
// app's API shapes (app/src/lib/types.ts) build on these.

/** A node type a workspace adds (or a built-in one it re-draws): a name, a picker category, a library icon. */
export interface CustomType {
	name: string;
	category: string;
	icon: string;
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

// ---- the .daidal.json document, version 1 (web/index.html buildConfig) ----

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
	/**
	 * What it holds or exposes besides its functions, one per line of its card: a class's fields, a file's exports.
	 * With `functions` or `path`, this makes the card a code block. (A table's columns have their own `columns`.)
	 */
	members?: string[];
	/** What it can be asked to do: a class's methods, a module's functions. Each makes a line of its code block. */
	functions?: DocFunction[];
	/**
	 * The language its code is in (java, kotlin, typescript, javascript, python, ruby, go, rust, csharp, swift):
	 * its functions read as that language writes them. Without one they read in a neutral form.
	 */
	language?: string;
	/** Where it lives: a file path, or a link to the source. */
	path?: string;
	/**
	 * A database table's columns, in order: each with its name, its data type and its key. On a Table, this makes the
	 * card a table block. Tables don't point at each other yet; see DocColumn.
	 */
	columns?: DocColumn[];
	/** Web pages ({ url }) and diagrams to zoom into ({ diagram, view? }), in one list. */
	links?: NodeLink[];
	/** "<diagram id>#<node id>": this node is the same thing as that node in another diagram. */
	ref?: string;
}

/** One of a code block's functions: its name, its parameters, what it returns, and a note on what it does. */
export interface DocFunction {
	name: string;
	params?: DocParam[];
	returns?: string;
	notes?: string;
}

/** A function's parameter: its name, and its type when it has one. */
export interface DocParam {
	name: string;
	type?: string;
}

/** What kind of key a column is: its table's primary key, a foreign key to another table, or unique. */
export type ColumnKey = 'pk' | 'fk' | 'unique';

/**
 * One of a table's columns: its name, its data type in the database's own words (uuid, varchar(255), timestamptz…) and
 * its key, if it is one. Its id stays the same when it is renamed, so a relationship between tables can point at it
 * once diagrams draw them (an ERD); nothing points at a column yet.
 */
export interface DocColumn {
	id?: string;
	name: string;
	type?: string;
	key?: ColumnKey;
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

export interface DaidalDoc {
	version: 1;
	diagram?: { id?: string; name?: string; kind?: string; view?: string };
	tags?: Record<string, DocTag>;
	/** A locked view can still be shown, but not renamed, re-saved or deleted. */
	views?: { name: string; tags: string[]; locked?: boolean }[];
	nodes?: DocNode[];
	edges?: DocEdge[];
	boundaries?: DocBoundary[];
}
