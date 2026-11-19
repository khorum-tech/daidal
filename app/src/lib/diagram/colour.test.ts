import { describe, expect, it } from 'vitest';
import { colorGap, distinguishable, filterMatrix, simColor } from './colour';
import { MORE_TAG_COLORS, TAG_COLORS } from '@khorum-oss/daidal-core/edit';

describe('simColor', () => {
	it('leaves a colour alone in full colour', () => {
		expect(simColor('#e0707c', 'none')).toBe('#e0707c');
	});

	it('keeps black, white and greys as they are', () => {
		for (const c of ['deuter', 'protan', 'tritan', 'mono'] as const) {
			expect(simColor('#000000', c)).toBe('#000000');
			expect(simColor('#ffffff', c)).toBe('#ffffff');
		}
		expect(simColor('#808080', 'mono')).toBe('#808080');
	});

	it('turns a colour grey under monochromacy', () => {
		const [r, g, b] = simColor('#e0707c', 'mono').slice(1).match(/../g)!;
		expect(r).toBe(g);
		expect(g).toBe(b);
	});

	it('makes red and green alike under deuteranopia', () => {
		const red = '#e0707c';
		const green = '#a9cc6a';
		expect(colorGap(simColor(red, 'deuter'), simColor(green, 'deuter'))).toBeLessThan(colorGap(red, green) / 2);
	});
});

describe('colorGap', () => {
	it('is zero for the same colour and grows with the difference', () => {
		expect(colorGap('#123456', '#123456')).toBe(0);
		expect(colorGap('#000000', '#ffffff')).toBeGreaterThan(colorGap('#000000', '#808080'));
	});
});

describe('distinguishable', () => {
	it('keeps everything in full colour', () => {
		expect(distinguishable(MORE_TAG_COLORS, 'none')).toEqual(MORE_TAG_COLORS);
	});

	it('strikes colours that collide, keeping the first of each pair, in order', () => {
		const kept = distinguishable(MORE_TAG_COLORS, 'deuter');
		expect(kept.length).toBeLessThan(MORE_TAG_COLORS.length);
		expect(kept[0]).toBe(MORE_TAG_COLORS[0]);
		expect(kept).toEqual(MORE_TAG_COLORS.filter(c => kept.includes(c)));
	});

	it('leaves fewer under monochromacy than under deuteranopia', () => {
		const all = [...TAG_COLORS, ...MORE_TAG_COLORS];
		expect(distinguishable(all, 'mono').length).toBeLessThanOrEqual(distinguishable(all, 'deuter').length);
	});
});

describe('filterMatrix', () => {
	it('is a 4×5 colour matrix that keeps alpha', () => {
		const v = filterMatrix('protan').split(' ').map(Number);
		expect(v).toHaveLength(20);
		expect(v.slice(15)).toEqual([0, 0, 0, 1, 0]);
		expect(v.slice(0, 3)).toEqual([0.11238, 0.88762, 0]);
	});
});
