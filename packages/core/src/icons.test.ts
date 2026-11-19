import { describe, expect, it } from 'vitest';
import { catalogue, ICON_LIBRARY, ICON_PATHS, isNodeIcon, NODE_ICONS, searchIcons, TYPE_CATS, typeIcon } from './icons';

const types = TYPE_CATS.flatMap(c => c.items);

describe('the icon library', () => {
	it('has a path, label and keywords for every icon', () => {
		for (const [name, icon] of Object.entries(ICON_LIBRARY)) {
			expect(icon.path, name).toMatch(/^M[\d.,\s\-A-Za-z]+$/);
			expect(icon.label, name).not.toBe('');
			expect(Array.isArray(icon.keywords), name).toBe(true);
		}
		expect(ICON_PATHS.robot).toBe(ICON_LIBRARY.robot.path);
	});

	it('offers nodes every icon but the app controls', () => {
		expect(NODE_ICONS).toContain('robot');
		expect(NODE_ICONS).toContain('database');
		expect(NODE_ICONS).not.toContain('trash');
		expect(NODE_ICONS.length).toBeGreaterThan(150);
	});

	it('searches names, labels and keywords', () => {
		expect(searchIcons('')).toEqual(NODE_ICONS);
		expect(searchIcons('  ROBOT ')).toContain('robot');
		expect(searchIcons('artificial intelligence')).toContain('robot');
		expect(searchIcons('plugs')).toEqual(expect.arrayContaining(['plugs', 'plugsConnected']));
		expect(searchIcons('zzz')).toEqual([]);
	});
});

describe('the type catalogue', () => {
	it('draws every type with a node icon from the library', () => {
		for (const [label, icon] of types) expect(NODE_ICONS, `${label} → ${icon}`).toContain(icon);
	});

	it('names each type once', () => {
		const labels = types.map(([label]) => label.toLowerCase());
		expect(new Set(labels).size).toBe(labels.length);
	});

	it('knows the newer kinds of system', () => {
		expect(typeIcon('AI Agent')).toBe('robot');
		expect(typeIcon('MCP Server')).toBe('plugsConnected');
		expect(typeIcon('LLM')).toBe('brain');
		expect(typeIcon('CLI')).toBe('terminalWindow');
	});

	it('gives a type it doesn’t know the cube', () => {
		expect(typeIcon('Quantum Thing')).toBe('cube');
	});
});

describe('a workspace catalogue', () => {
	const custom = [
		{ name: 'Billing Agent', category: 'AI', icon: 'robot' },
		{ name: 'Ledger', category: 'Finance', icon: 'bank' },
		{ name: 'database', category: 'data', icon: 'hardDrive' }
	];
	const cats = catalogue(custom);

	it('is the built-ins when the workspace has no types', () => {
		expect(catalogue([])).toBe(TYPE_CATS);
	});

	it('puts a type in its category, matched without regard to case, and a new category after the built-ins', () => {
		expect(cats.find(c => c.cat === 'AI')!.items.at(-1)).toEqual(['Billing Agent', 'robot']);
		expect(cats.at(-1)).toEqual({ cat: 'Finance', items: [['Ledger', 'bank']] });
	});

	it('lets a type named like a built-in one take its place', () => {
		const data = cats.find(c => c.cat === 'Data')!.items;
		expect(data.filter(([l]) => l.toLowerCase() === 'database')).toEqual([['database', 'hardDrive']]);
		expect(typeIcon('Database', cats)).toBe('hardDrive');
		expect(typeIcon('Database')).toBe('database');
	});

	it('draws the workspace types, any spelling, and the cube for an icon outside the library', () => {
		expect(typeIcon('billing-agent', cats)).toBe('robot');
		expect(typeIcon('Billing Agent', cats)).toBe('robot');
		expect(typeIcon('Billing Agent')).toBe('cube');
		expect(catalogue([{ name: 'Odd', category: 'AI', icon: 'trash' }]).find(c => c.cat === 'AI')!.items.at(-1)).toEqual(['Odd', 'cube']);
	});

	it('knows which icons a node can show', () => {
		expect(isNodeIcon('robot')).toBe(true);
		expect(isNodeIcon('trash')).toBe(false);
		expect(isNodeIcon('toString')).toBe(false);
		expect(isNodeIcon(undefined)).toBe(false);
	});
});
