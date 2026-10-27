/**
 * Colour-vision simulation, as in the prototype (web/index.html `simColor`, `colorGap`, `cvdFilter`): what a colour
 * looks like under each condition, and which colours of a palette stay told apart.
 */

export type Condition = 'none' | 'deuter' | 'protan' | 'tritan' | 'mono';

export const CONDITIONS: { id: Condition; label: string }[] = [
	{ id: 'none', label: 'Full colour' },
	{ id: 'deuter', label: 'Deuteranopia' },
	{ id: 'protan', label: 'Protanopia' },
	{ id: 'tritan', label: 'Tritanopia' },
	{ id: 'mono', label: 'Monochromacy' }
];

/** Viénot/Brettel dichromat matrices (and luminance for monochromacy), applied in linear sRGB. */
export const CVD_MATRICES: Record<Exclude<Condition, 'none'>, number[]> = {
	protan: [0.11238, 0.88762, 0, 0.07276, 0.92724, 0, 0.00399, -0.00399, 1],
	deuter: [0.29275, 0.70725, 0, 0.34597, 0.65403, 0, -0.0211, 0.0211, 1],
	tritan: [1, 0.14461, -0.14461, 0, 0.85659, 0.14341, 0, 0.85841, 0.14159],
	mono: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722]
};

/** Two simulated colours closer than this (redmean distance) count as the same. */
const COLLIDE = 42;

const toLinear = (v: number) => {
	const c = v / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
	const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, Math.round(c * 255)));
};
const rgb = (hex: string) => {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** [hex] as someone with [condition] sees it. */
export function simColor(hex: string, condition: Condition): string {
	if (condition === 'none') return hex;
	const m = CVD_MATRICES[condition];
	const [r, g, b] = rgb(hex).map(toLinear);
	const out = [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
	return '#' + out.map(v => fromLinear(v).toString(16).padStart(2, '0')).join('');
}

/** Redmean distance: close enough to spot two swatches that collide. */
export function colorGap(a: string, b: string): number {
	const [r1, g1, b1] = rgb(a);
	const [r2, g2, b2] = rgb(b);
	const rm = (r1 + r2) / 2;
	const [dr, dg, db] = [r1 - r2, g1 - g2, b1 - b2];
	return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** The colours that stay told apart under [condition]: each one that collides with an earlier kept one is dropped. */
export function distinguishable(colors: string[], condition: Condition): string[] {
	if (condition === 'none') return colors.slice();
	const kept: string[] = [];
	for (const c of colors) {
		const seen = simColor(c, condition);
		if (!kept.some(k => colorGap(seen, simColor(k, condition)) < COLLIDE)) kept.push(c);
	}
	return kept;
}

/** An SVG feColorMatrix `values` string for [condition] (applied in linear RGB by the filter). */
export function filterMatrix(condition: Exclude<Condition, 'none'>): string {
	const m = CVD_MATRICES[condition];
	return [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0].join(' ');
}
