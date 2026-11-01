import { describe, expect, it } from 'vitest';
import { ICON_LIBRARY, ICON_PATHS, NODE_ICONS, searchIcons, TYPE_CATS, typeIcon } from './icons';

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
