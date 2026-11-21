import { CONDITIONS, type Condition } from './diagram/colour';

/**
 * How this browser shows Daidal: the theme and its colours, a colour-vision condition (which strikes colliding colours from the tag
 * pickers, and can be simulated over the whole app), and icon-only cards when presenting. These are viewer
 * settings, as in the prototype: kept in the browser, never in a document.
 */

export type Theme = 'dark' | 'light' | 'system';

/** A colour palette: [swatch] previews it as its ground, its panel and its accent. */
export interface Palette {
	id: string;
	label: string;
	swatch: readonly [bg: string, surface: string, accent: string];
}

/**
 * The palettes each theme offers, the default first. Every one keeps its accent in the logo's purple family and
 * varies the ground. The colours themselves are in styles/palettes.css, under the same ids.
 */
export const DARK_PALETTES = [
	{ id: 'nocturne', label: 'Nocturne', swatch: ['#161826', '#232532', '#9184d9'] },
	{ id: 'midnight', label: 'Midnight', swatch: ['#0e1222', '#191e33', '#8a90ea'] },
	{ id: 'plum', label: 'Plum', swatch: ['#1b1524', '#2a2135', '#ab88e2'] },
	{ id: 'graphite', label: 'Graphite', swatch: ['#17171a', '#242428', '#9d92d8'] },
	{ id: 'ink', label: 'Ink', swatch: ['#0b0b10', '#16161d', '#a497f0'] }
] as const satisfies readonly Palette[];
export const LIGHT_PALETTES = [
	{ id: 'paper', label: 'Paper', swatch: ['#f2f3f9', '#fbfbfe', '#6a5cb3'] },
	{ id: 'lilac', label: 'Lilac', swatch: ['#f0ecfa', '#fbf9ff', '#6d53b6'] },
	{ id: 'sand', label: 'Sand', swatch: ['#f5f1e9', '#fdfbf6', '#6b56ae'] },
	{ id: 'mist', label: 'Mist', swatch: ['#eaf0f6', '#f9fbfd', '#5b61b8'] }
] as const satisfies readonly Palette[];
export type DarkPalette = (typeof DARK_PALETTES)[number]['id'];
export type LightPalette = (typeof LIGHT_PALETTES)[number]['id'];

export interface Settings {
	theme: Theme;
	/** The colours the dark theme uses, and the light one. */
	darkPalette: DarkPalette;
	lightPalette: LightPalette;
	condition: Condition;
	simulate: boolean;
	iconCards: boolean;
}

export const DEFAULTS: Settings = {
	theme: 'dark',
	darkPalette: 'nocturne',
	lightPalette: 'paper',
	condition: 'none',
	simulate: false,
	iconCards: false
};
const KEY = 'skope.appearance';

/** Settings read back from storage; anything unknown falls back to its default. */
export function parseSettings(raw: string | null): Settings {
	let v: Record<string, unknown> = {};
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : {};
		if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
	} catch {
		// Unreadable: the defaults.
	}
	const theme = (['dark', 'light', 'system'] as const).find(t => t === v.theme) ?? DEFAULTS.theme;
	const condition = CONDITIONS.find(c => c.id === v.condition)?.id ?? DEFAULTS.condition;
	return {
		theme,
		darkPalette: DARK_PALETTES.find(p => p.id === v.darkPalette)?.id ?? DEFAULTS.darkPalette,
		lightPalette: LIGHT_PALETTES.find(p => p.id === v.lightPalette)?.id ?? DEFAULTS.lightPalette,
		condition,
		simulate: condition !== 'none' && v.simulate === true,
		iconCards: v.iconCards === true
	};
}

/** Whether [theme] comes out light, given whether the system prefers dark. */
export function isLight(theme: Theme, prefersDark: boolean): boolean {
	return theme === 'system' ? !prefersDark : theme === 'light';
}

class Appearance {
	#s = $state<Settings>(DEFAULTS);
	#prefersDark = $state(true);
	#started = false;

	get theme() {
		return this.#s.theme;
	}
	get darkPalette() {
		return this.#s.darkPalette;
	}
	get lightPalette() {
		return this.#s.lightPalette;
	}
	/** The palette on screen now: the light theme's or the dark one's. */
	get palette(): DarkPalette | LightPalette {
		return this.light ? this.#s.lightPalette : this.#s.darkPalette;
	}
	get condition() {
		return this.#s.condition;
	}
	get simulate() {
		return this.#s.simulate;
	}
	get iconCards() {
		return this.#s.iconCards;
	}
	get light() {
		return isLight(this.#s.theme, this.#prefersDark);
	}
	/** The condition the app is drawn through, or null. */
	get simulating(): Exclude<Condition, 'none'> | null {
		return this.#s.simulate && this.#s.condition !== 'none' ? this.#s.condition : null;
	}

	/** Reads the saved settings and follows the system theme. Call once, from the layout. */
	start(): () => void {
		if (this.#started) return () => {};
		this.#started = true;
		try {
			this.#s = parseSettings(localStorage.getItem(KEY));
		} catch {
			this.#s = DEFAULTS;
		}
		const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
		if (!mq) return () => (this.#started = false);
		this.#prefersDark = mq.matches;
		const follow = (e: MediaQueryListEvent) => (this.#prefersDark = e.matches);
		mq.addEventListener('change', follow);
		return () => {
			mq.removeEventListener('change', follow);
			this.#started = false;
		};
	}

	set(change: Partial<Settings>): void {
		const next = { ...this.#s, ...change };
		// Simulating needs a condition to simulate.
		if (next.condition === 'none') next.simulate = false;
		this.#s = next;
		try {
			localStorage.setItem(KEY, JSON.stringify(next));
		} catch {
			// Kept for this visit only.
		}
	}
}

export const appearance = new Appearance();
