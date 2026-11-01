// The icons Skope draws and the node types it knows. Both are data: icon-library.json is built by
// scripts/icons.mjs from Phosphor (MIT licence, paths on a 256 × 256 grid), and types.json lists the type picker's
// categories, each type with an icon from the library. To add an icon, see scripts/icons.mjs; to add a type, add
// a line to types.json.
import type { CustomType } from '../types';
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
const NODE_ICON_SET = new Set(NODE_ICONS);

/** Whether [name] is an icon a node can show. */
export const isNodeIcon = (name: unknown): name is string => typeof name === 'string' && NODE_ICON_SET.has(name);

/** Node icons whose name, label or keywords match [query] (all of them when it's blank). */
export function searchIcons(query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return NODE_ICONS;
	return NODE_ICONS.filter(name => {
		const icon = ICON_LIBRARY[name];
		return name.toLowerCase().includes(q) || icon.label.toLowerCase().includes(q) || icon.keywords.some(k => k.includes(q));
	});
}

/** Node types by category, each with its icon, in the type picker's order. */
export type TypeCats = { cat: string; items: [label: string, icon: string][] }[];

/** The built-in types. */
export const TYPE_CATS = types as TypeCats;

/** Two spellings of one type ("Data Warehouse", "data-warehouse") come out the same. */
export const typeKey = (type: string) => type.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The types a workspace offers: the built-in ones with its [custom] types merged in. A custom type named like a
 * built-in one takes its place (its icon, and its category if that differs); the rest go into their category,
 * matched without regard to case, and a category the built-ins don't have comes after theirs.
 */
export function catalogue(custom: CustomType[] = []): TypeCats {
	if (!custom.length) return TYPE_CATS;
	const replaced = new Set(custom.map(t => typeKey(t.name)));
	const cats: TypeCats = TYPE_CATS.map(c => ({ cat: c.cat, items: c.items.filter(([label]) => !replaced.has(typeKey(label))) }));
	for (const t of custom) {
		let cat = cats.find(c => c.cat.toLowerCase() === t.category.trim().toLowerCase());
		if (!cat) {
			cat = { cat: t.category.trim(), items: [] };
			cats.push(cat);
		}
		cat.items.push([t.name, isNodeIcon(t.icon) ? t.icon : 'cube']);
	}
	return cats.filter(c => c.items.length);
}

/** Badges a node can carry. */
export const FLAGS: { id: string; label: string; icon: string }[] = [
	{ id: 'db', label: 'Database', icon: 'database' },
	{ id: 'cache', label: 'Cache', icon: 'lightning' },
	{ id: 'mq', label: 'Message queue', icon: 'queue' }
];

const iconMaps = new WeakMap<TypeCats, Map<string, string>>();

/** The icon for a type in [cats] (the built-ins unless given); a type it doesn't know gets the cube. */
export function typeIcon(type: string, cats: TypeCats = TYPE_CATS): string {
	let icons = iconMaps.get(cats);
	if (!icons) {
		icons = new Map(cats.flatMap(c => c.items.map(([label, icon]) => [typeKey(label), icon])));
		iconMaps.set(cats, icons);
	}
	return icons.get(typeKey(type)) ?? 'cube';
}
