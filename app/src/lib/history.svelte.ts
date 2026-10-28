import type { SkopeDoc } from './types';

interface Step {
	label: string;
	doc: SkopeDoc;
}

/**
 * Undo and redo for a document being edited: each change records the document as it was before. Changes that
 * share a [group] (typing into one field, say) undo as one step until the group ends, the way the prototype keeps
 * a field edit as one entry from focus to blur.
 */
export class History {
	#past = $state<Step[]>([]);
	#future = $state<Step[]>([]);
	#group: string | null = null;
	readonly #limit: number;

	constructor(limit = 100) {
		this.#limit = limit;
	}

	/** Note a change about to be made to [before]. */
	record(before: SkopeDoc, label: string, group: string | null = null): void {
		if (group !== null && group === this.#group) return;
		this.#group = group;
		this.#past = [...this.#past.slice(-(this.#limit - 1)), { label, doc: before }];
		this.#future = [];
	}

	/** The next change starts a new step, even within the same group. */
	endGroup(): void {
		this.#group = null;
	}

	/** The document to go back to from [current], or null when there is nothing to undo. */
	undo(current: SkopeDoc): SkopeDoc | null {
		const step = this.#past.at(-1);
		if (!step) return null;
		this.#group = null;
		this.#past = this.#past.slice(0, -1);
		this.#future = [...this.#future, { label: step.label, doc: current }];
		return step.doc;
	}

	redo(current: SkopeDoc): SkopeDoc | null {
		const step = this.#future.at(-1);
		if (!step) return null;
		this.#group = null;
		this.#future = this.#future.slice(0, -1);
		this.#past = [...this.#past, { label: step.label, doc: current }];
		return step.doc;
	}

	/** Every step in the order made: the done ones, then the undone ones redo would bring back. */
	get steps(): { label: string; done: boolean }[] {
		return [...this.#past.map(s => ({ label: s.label, done: true })), ...this.#future.toReversed().map(s => ({ label: s.label, done: false }))];
	}

	/**
	 * The document with the first [count] steps done and the rest undone, from [current]; one undo or redo per step
	 * between, so each can still be undone or redone. Null when nothing would change.
	 */
	goTo(current: SkopeDoc, count: number): SkopeDoc | null {
		let doc: SkopeDoc | null = null;
		while (this.#past.length > count) doc = this.undo(doc ?? current);
		while (this.#past.length < count && this.#future.length) doc = this.redo(doc ?? current);
		return doc;
	}

	/** What undo would take back, for its button's label. */
	get undoLabel(): string | null {
		return this.#past.at(-1)?.label ?? null;
	}

	get redoLabel(): string | null {
		return this.#future.at(-1)?.label ?? null;
	}
}
