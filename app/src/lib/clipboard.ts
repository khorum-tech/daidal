import type { Clip } from './diagram/edit';

/**
 * What ⌘C or ⌘X last copied, kept in this browser so it pastes into another diagram, or after a reload. It never
 * goes to the system clipboard, so copying a diagram's nodes doesn't overwrite text someone copied elsewhere.
 */
const KEY = 'skope.clip';
let held: Clip | null = null;

export function putClip(clip: Clip): void {
	held = clip;
	try {
		localStorage.setItem(KEY, JSON.stringify(clip));
	} catch {
		// Storage can be blocked or full; the copy still pastes during this visit.
	}
}

export function getClip(): Clip | null {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved) {
			const clip = JSON.parse(saved) as Clip;
			if (Array.isArray(clip?.nodes) && Array.isArray(clip.edges)) held = { ...clip, tags: clip.tags ?? {} };
		}
	} catch {
		// Unreadable or blocked: fall back to what this visit copied.
	}
	return held?.nodes.length ? held : null;
}
