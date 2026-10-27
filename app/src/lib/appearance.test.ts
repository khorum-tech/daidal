import { describe, expect, it } from 'vitest';
import { DEFAULTS, isLight, parseSettings } from './appearance.svelte';

describe('parseSettings', () => {
	it('falls back to the defaults for nothing, junk or the wrong shape', () => {
		expect(parseSettings(null)).toEqual(DEFAULTS);
		expect(parseSettings('{not json')).toEqual(DEFAULTS);
		expect(parseSettings('[1,2]')).toEqual(DEFAULTS);
		expect(parseSettings('{"theme":"neon","condition":"x","iconCards":"yes"}')).toEqual(DEFAULTS);
	});

	it('reads back what was saved', () => {
		expect(parseSettings('{"theme":"light","condition":"tritan","simulate":true,"iconCards":true}')).toEqual({
			theme: 'light',
			condition: 'tritan',
			simulate: true,
			iconCards: true
		});
	});

	it('does not simulate without a condition', () => {
		expect(parseSettings('{"condition":"none","simulate":true}').simulate).toBe(false);
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
