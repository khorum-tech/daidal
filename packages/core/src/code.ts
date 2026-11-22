import type { DocFunction, DocParam } from './types';

/**
 * A code block's functions: what a class, module or file can be asked to do, each with its name, its parameters,
 * what it returns and a note on what it does. Documents keep them as structured entries; people and configs may
 * also write them as signatures ("check(batch: Batch): Verdict"), which read into the same entries.
 */

const IDENT = /^[A-Za-z_$][\w$.]*[!?]?$/;

/**
 * Splits [text] at its own commas: those inside (), [], {} or <> belong to the part they're in, so a parameter
 * typed `Map<K, V>` stays whole.
 */
export function splitTopLevel(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
		else if ((c === ')' || c === ']' || c === '}' || c === '>') && depth > 0) depth--;
		else if (c === ',' && depth === 0) {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map(p => p.trim()).filter(Boolean);
}

/** One parameter as written: "batch: Batch", "batch" or "batch?: Batch". */
export function parseParam(text: string): DocParam | null {
	const s = text.trim();
	if (!s) return null;
	const colon = s.indexOf(':');
	if (colon < 0) return { name: s };
	const name = s.slice(0, colon).trim();
	const type = s.slice(colon + 1).trim();
	if (!name) return null;
	return type ? { name, type } : { name };
}

/** Parameters as one line: "batch: Batch, strict: Boolean". */
export const parseParams = (text: string): DocParam[] => splitTopLevel(text).map(parseParam).filter((p): p is DocParam => p !== null);

/** Parameters written back as one line. */
export const paramsText = (params: DocParam[] | undefined): string => (params ?? []).map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ');

/** A function as one line: name(a: A, b: B): R. */
export function signature(f: DocFunction): string {
	return `${f.name}(${paramsText(f.params)})${f.returns ? `: ${f.returns}` : ''}`;
}

/** A line of text with a list's bullet taken off: "- ", "* ", "• ". */
const unbulleted = (line: string) => line.trim().replace(/^(?:[-*•]\s+)/, '');

/**
 * A signature read into a function, or null when [text] isn't one: a name, its parameters in brackets and, after a
 * colon or an arrow, what it returns. "check(batch: Batch): Verdict", "reset()", "load(id) -> Order".
 */
export function parseSignature(text: string): DocFunction | null {
	const s = unbulleted(text);
	const open = s.indexOf('(');
	if (open <= 0) return null;
	const name = s.slice(0, open).trim();
	if (!IDENT.test(name)) return null;
	let depth = 0;
	let close = -1;
	for (let i = open; i < s.length; i++) {
		if (s[i] === '(') depth++;
		else if (s[i] === ')' && --depth === 0) {
			close = i;
			break;
		}
	}
	if (close < 0) return null;
	const rest = s.slice(close + 1).trim();
	let returns = '';
	if (rest) {
		const m = /^(?::|->|=>)\s*(.+)$/.exec(rest);
		if (!m) return null;
		returns = m[1].trim();
	}
	const params = parseParams(s.slice(open + 1, close));
	return { name, ...(params.length ? { params } : {}), ...(returns ? { returns } : {}) };
}

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

function param(raw: unknown): DocParam | null {
	if (typeof raw === 'string') return parseParam(raw);
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const name = text(o.name).trim();
	if (!name) return null;
	const type = text(o.type).trim();
	return type ? { name, type } : { name };
}

/**
 * One function as a document or config gives it, cleaned: a signature string, or an entry with a name and
 * any of params (a list, or one line of them), returns and notes. Null when it has no name.
 */
export function toFunction(raw: unknown): DocFunction | null {
	if (typeof raw === 'string') {
		const s = raw.trim();
		if (!s) return null;
		return parseSignature(s) ?? { name: s };
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	const name = text(o.name).trim();
	if (!name) return null;
	const params = (typeof o.params === 'string' ? parseParams(o.params) : Array.isArray(o.params) ? o.params.map(param) : []).filter((p): p is DocParam => p !== null);
	const returns = text(o.returns).trim();
	const notes = text(o.notes).trim();
	return { name, ...(params.length ? { params } : {}), ...(returns ? { returns } : {}), ...(notes ? { notes } : {}) };
}

/** A node's functions as its document holds them, cleaned: a list of entries or signatures; anything else is none. */
export const toFunctions = (raw: unknown): DocFunction[] => (Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw]).map(toFunction).filter((f): f is DocFunction => f !== null);

/**
 * Functions written as text in a node's members, subtitle or notes (one a line, as code boxes kept them before
 * they had functions of their own), and what each of those fields keeps without them. A line that isn't a
 * signature stays where it was.
 */
export function functionsInText(n: { members?: string[]; subtitle?: string; notes?: string }): {
	found: DocFunction[];
	members: string[];
	subtitle: string;
	notes: string;
} {
	const found: DocFunction[] = [];
	const take = (lines: string[]) =>
		lines.filter(line => {
			const f = parseSignature(line);
			if (f) found.push(f);
			return !f;
		});
	const members = take(n.members ?? []);
	const subtitle = take((n.subtitle ?? '').split('\n')).join('\n').trim();
	const notes = take((n.notes ?? '').split('\n')).join('\n').trim();
	return { found, members, subtitle, notes };
}
