// The icons Skope draws and the node types it knows. Both are data: icon-library.json is built by
// scripts/icons.mjs from Phosphor (MIT licence, paths on a 256 × 256 grid), and types.json lists the type picker's
// categories, each type with an icon from the library. To add an icon, see scripts/icons.mjs; to add a type, add
// a line to types.json.
import library from './icon-library.json';
import types from './types.json';

export interface LibraryIcon {
	path: string;
	label: string;
	keywords: string[];
	/** Came across from the prototype as is. */
	from?: string;
	/** One of the app's own controls, not offered for nodes. */
	ui?: boolean;
}

export const ICON_LIBRARY: Record<string, LibraryIcon> = library;

export const ICON_PATHS: Record<string, string> = Object.fromEntries(Object.entries(ICON_LIBRARY).map(([name, icon]) => [name, icon.path]));

/** The icons a node can show, in the library's (alphabetical) order. */
export const NODE_ICONS: string[] = Object.keys(ICON_LIBRARY).filter(name => !ICON_LIBRARY[name].ui);

/** Node icons whose name, label or keywords match [query] (all of them when it's blank). */
export function searchIcons(query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return NODE_ICONS;
	return NODE_ICONS.filter(name => {
		const icon = ICON_LIBRARY[name];
		return name.toLowerCase().includes(q) || icon.label.toLowerCase().includes(q) || icon.keywords.some(k => k.includes(q));
	});
}

/** Node types by category, each with its icon. The order is the type picker's. */
export const TYPE_CATS = types as { cat: string; items: [label: string, icon: string][] }[];

/** Badges a node can carry. */
export const FLAGS: { id: string; label: string; icon: string }[] = [
	{ id: 'db', label: 'Database', icon: 'database' },
	{ id: 'cache', label: 'Cache', icon: 'lightning' },
	{ id: 'mq', label: 'Message queue', icon: 'queue' }
];

const TYPE_ICON = new Map(TYPE_CATS.flatMap(c => c.items));

/** The icon for a display type; types the catalogue doesn't know get the cube. */
export function typeIcon(type: string): string {
	return TYPE_ICON.get(type) ?? 'cube';
}
