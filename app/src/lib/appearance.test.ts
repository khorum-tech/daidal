import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DARK_PALETTES, DEFAULTS, isLight, LIGHT_PALETTES, parseSettings } from './appearance.svelte';

describe('parseSettings', () => {
	it('falls back to the defaults for nothing, junk or the wrong shape', () => {
		expect(parseSettings(null)).toEqual(DEFAULTS);
		expect(parseSettings('{not json')).toEqual(DEFAULTS);
		expect(parseSettings('[1,2]')).toEqual(DEFAULTS);
		expect(parseSettings('{"theme":"neon","condition":"x","iconCards":"yes"}')).toEqual(DEFAULTS);
	});

	it('reads back what was saved', () => {
		expect(
			parseSettings('{"theme":"light","darkPalette":"plum","lightPalette":"sand","condition":"tritan","simulate":true,"iconCards":true}')
		).toEqual({
			theme: 'light',
			darkPalette: 'plum',
			lightPalette: 'sand',
			condition: 'tritan',
			simulate: true,
			iconCards: true
		});
	});

	it('does not simulate without a condition', () => {
		expect(parseSettings('{"condition":"none","simulate":true}').simulate).toBe(false);
	});
});

const css = readFileSync(new URL('./styles/palettes.css', import.meta.url), 'utf8');

describe('palettes', () => {
	it('keeps the defaults for a palette it does not know, or one from the other theme', () => {
		const s = parseSettings('{"darkPalette":"sand","lightPalette":"neon"}');
		expect([s.darkPalette, s.lightPalette]).toEqual(['nocturne', 'paper']);
	});

	it('has colours in palettes.css for every palette but the two defaults', () => {
		const styled = (theme: string) => [...css.matchAll(new RegExp(`data-theme='${theme}'\\]\\[data-palette='([a-z]+)'`, 'g'))].map(m => m[1]);
		expect(styled('dark')).toEqual(DARK_PALETTES.slice(1).map(p => p.id));
		expect(styled('light')).toEqual(LIGHT_PALETTES.slice(1).map(p => p.id));
	});

	it('previews each palette with the ground, panel and accent its styles set', () => {
		for (const p of [...DARK_PALETTES.slice(1), ...LIGHT_PALETTES.slice(1)]) {
			const block = css.slice(css.indexOf(`[data-palette='${p.id}']`));
			expect(block.slice(0, block.indexOf('}'))).toContain(`--color-bg: ${p.swatch[0]};`);
			expect(block).toContain(`--color-surface: ${p.swatch[1]};`);
			expect(block).toContain(`--color-accent: ${p.swatch[2]};`);
		}
	});
});

describe('isLight', () => {
	it('follows the system only when asked to', () => {
		expect(isLight('light', true)).toBe(true);
		expect(isLight('dark', false)).toBe(false);
		expect(isLight('system', true)).toBe(false);
		expect(isLight('system', false)).toBe(true);
	});
});
