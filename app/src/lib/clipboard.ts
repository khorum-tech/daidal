import type { Clip } from './diagram/edit';

/**
 * What ⌘C or ⌘X last copied, kept for this tab (sessionStorage) so it pastes into another diagram, or after a
 * reload, and is gone once the tab closes: diagram content doesn't linger on a shared computer. It never goes to the
 * system clipboard, so copying a diagram's nodes doesn't overwrite text someone copied elsewhere.
 */
const KEY = 'skope.clip';
let held: Clip | null = null;

// Copies used to be kept in localStorage, where they outlived the visit; clear any left there.
try {
	localStorage.removeItem(KEY);
} catch {
	// Storage can be blocked; there is then nothing to clear.
}

export function putClip(clip: Clip): void {
	held = clip;
	try {
		sessionStorage.setItem(KEY, JSON.stringify(clip));
	} catch {
		// Storage can be blocked or full; the copy still pastes during this visit.
	}
}

export function getClip(): Clip | null {
	try {
		const saved = sessionStorage.getItem(KEY);
		if (saved) {
			const clip = JSON.parse(saved) as Clip;
			if (Array.isArray(clip?.nodes) && Array.isArray(clip.edges)) held = { ...clip, tags: clip.tags ?? {} };
		}
	} catch {
		// Unreadable or blocked: fall back to what this visit copied.
	}
	return held?.nodes.length ? held : null;
}
