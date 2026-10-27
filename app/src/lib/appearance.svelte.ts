import { CONDITIONS, type Condition } from './diagram/colour';

/**
 * How this browser shows Skope: the theme, a colour-vision condition (which strikes colliding colours from the tag
 * pickers, and can be simulated over the whole app), and icon-only cards when presenting. These are viewer
 * settings, as in the prototype: kept in the browser, never in a document.
 */

export type Theme = 'dark' | 'light' | 'system';

export interface Settings {
	theme: Theme;
	condition: Condition;
	simulate: boolean;
	iconCards: boolean;
}

export const DEFAULTS: Settings = {
	theme: 'dark',
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
