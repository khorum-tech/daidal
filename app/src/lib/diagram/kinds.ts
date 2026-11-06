// Diagram kinds (docs/superpowers/specs/2026-11-05-skope-kinds-c4-and-repo-aware-ai.md). A kind changes three things
// and no more: which types the Add menu offers first, which checks run (later), and what "Zoom in → New diagram"
// creates (the child kind). Every type stays reachable whatever the kind, and changing a diagram's kind loses nothing.

export type KindId = 'freeform' | 'c4-context' | 'c4-container' | 'c4-component' | 'c4-code' | 'deployment';

export interface Kind {
	id: KindId;
	label: string;
	/** Its place in the C4 stack, 1 (Context) to 4 (Code); none outside C4. */
	level?: 1 | 2 | 3 | 4;
	/** What zooming into one of its nodes makes; none at the bottom. */
	child?: KindId;
	/** The types the Add menu shows first, display names from types.json. */
	common: string[];
	/** One line for the kind picker. */
	hint: string;
}

/** The prototype's core types (web/index.html CORE_TYPES): what a freeform diagram offers first. */
const CORE = ['Web App', 'Service', 'Database', 'Queue', 'Actor', 'External', 'Storage', 'Note'];

export const KINDS: Kind[] = [
	{ id: 'freeform', label: 'Freeform', common: CORE, child: 'freeform', hint: 'Anything goes; no levels.' },
	{
		id: 'c4-context',
		label: 'C4 Context',
		level: 1,
		child: 'c4-container',
		common: ['Actor', 'System', 'External', 'Third-party API', 'Identity Provider', 'Payment Provider', 'Note'],
		hint: 'Level 1: people and software systems.'
	},
	{
		id: 'c4-container',
		label: 'C4 Container',
		level: 2,
		child: 'c4-component',
		common: ['Web App', 'Mobile App', 'Service', 'Function', 'Database', 'Queue', 'Object Storage', 'External', 'Note'],
		hint: 'Level 2: the apps and data stores inside one system.'
	},
	{
		id: 'c4-component',
		label: 'C4 Component',
		level: 3,
		child: 'c4-code',
		common: ['Component', 'Module', 'Database', 'Queue', 'External', 'Note'],
		hint: 'Level 3: the parts inside one container.'
	},
	{ id: 'c4-code', label: 'C4 Code', level: 4, common: ['Class', 'Function', 'Table', 'File', 'Note'], hint: 'Level 4: classes, functions, tables.' },
	{
		id: 'deployment',
		label: 'Deployment',
		child: 'deployment',
		common: ['Cluster', 'Container', 'Load Balancer', 'Edge', 'CDN', 'DNS', 'Database', 'Note'],
		hint: 'Where things run: regions, clusters, infrastructure.'
	}
];

const BY_ID = new Map(KINDS.map(k => [k.id, k]));

/** What diagrams said before kinds had ids: the templates' and stage's own words. */
const LEGACY: Record<string, KindId> = {
	c4: 'c4-container',
	'c4 container': 'c4-container',
	'c4 context': 'c4-context',
	infra: 'deployment',
	freeform: 'freeform'
};

/** The kind a document's `diagram.kind` means. Empty, unknown or missing reads as freeform; older words map over. */
export function kindOf(raw: unknown): Kind {
	if (typeof raw !== 'string') return BY_ID.get('freeform')!;
	const s = raw.trim().toLowerCase();
	return BY_ID.get(s as KindId) ?? BY_ID.get(LEGACY[s] ?? 'freeform')!;
}

/** The kind's common types that this catalogue has (a workspace may not), in the kind's order. */
export function commonTypes(kind: Kind, available: (type: string) => boolean): string[] {
	return kind.common.filter(available);
}

/** What a node is in C4 notation, which decides its card's fill and shape. */
export type C4Role = 'person' | 'system' | 'container' | 'component' | 'external' | 'store';

const PEOPLE = new Set(['Actor']);
const EXTERNAL = new Set(['External', 'Third-party API', 'Identity Provider', 'Payment Provider']);
const STORES = new Set(['Database', 'Cache', 'Object Storage', 'Storage', 'Data Warehouse', 'Search Index']);
const LEVEL_ROLE: Record<number, C4Role> = { 1: 'system', 2: 'container', 3: 'component' };

/**
 * [type]'s role in a diagram of [kind], or null where cards keep their usual look: outside C4, and at the Code level,
 * where classes and tables read better as plain cards.
 */
export function c4Role(kind: Kind, type: string): C4Role | null {
	const base = kind.level ? LEVEL_ROLE[kind.level] : undefined;
	if (!base) return null;
	if (PEOPLE.has(type)) return 'person';
	if (EXTERNAL.has(type)) return 'external';
	if (STORES.has(type) && kind.level !== 1) return 'store';
	return base;
}

/** The C4 element line under a card's name: "[Container: Kotlin]", "[Person]", "[External System]". */
export function c4Line(role: C4Role, kind: Kind, tech: string): string {
	const what: Record<C4Role, string> = {
		person: 'Person',
		system: 'Software System',
		external: 'External System',
		container: 'Container',
		component: 'Component',
		store: kind.level === 3 ? 'Component' : 'Container'
	};
	const t = tech.trim();
	return role === 'person' || role === 'system' || role === 'external' || !t ? `[${what[role]}]` : `[${what[role]}: ${t}]`;
}
