import { ApiError } from './api';
import type { SkopeDoc } from './types';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

/**
 * Saves a diagram's document as it changes. Changes close together go as one save; only one save is in flight at
 * a time, and a change made meanwhile goes next. Every save carries the revision it was made against, so a 409
 * means someone else saved in between: saving stops there ("conflict") until the page reloads the diagram.
 */
export class Saver {
	state = $state<SaveState>('saved');
	rev: number;
	#save: (rev: number, doc: SkopeDoc) => Promise<{ rev: number }>;
	#delay: number;
	#retry: number;
	#doc: SkopeDoc | null = null;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#busy = false;
	#again = false;

	/** [retry]: how long to wait after the server says to slow down (429) before trying the same save again. */
	constructor(save: (rev: number, doc: SkopeDoc) => Promise<{ rev: number }>, rev: number, delay = 600, retry = 5000) {
		this.#save = save;
		this.rev = rev;
		this.#delay = delay;
		this.#retry = retry;
	}

	/** A new version of the document to save, soon. */
	queue(doc: SkopeDoc): void {
		if (this.state === 'conflict') return;
		this.#doc = doc;
		this.state = 'pending';
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), this.#delay);
	}

	/** Save now: a queued change, or the last one again after an error. */
	async flush(): Promise<void> {
		clearTimeout(this.#timer);
		if (!this.#doc || this.state === 'conflict') return;
		if (this.#busy) {
			this.#again = true;
			return;
		}
		const doc = this.#doc;
		this.#busy = true;
		this.state = 'saving';
		try {
			this.rev = (await this.#save(this.rev, doc)).rev;
			if (this.#doc === doc) {
				this.#doc = null;
				this.state = 'saved';
			} else {
				this.state = 'pending';
			}
		} catch (e) {
			this.#again = false;
			if (e instanceof ApiError && e.status === 429) {
				// Too many changes this minute: nothing is wrong with this one, so keep it and try again shortly.
				this.state = 'pending';
				this.#timer = setTimeout(() => void this.flush(), this.#retry);
			} else {
				this.state = e instanceof ApiError && e.status === 409 ? 'conflict' : 'error';
			}
		} finally {
			this.#busy = false;
		}
		if (this.#again) {
			this.#again = false;
			await this.flush();
		}
	}

	/** Whether leaving now would lose a change. */
	get unsaved(): boolean {
		return this.state === 'pending' || this.state === 'saving' || this.state === 'error';
	}
}
