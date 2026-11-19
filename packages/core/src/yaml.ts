/**
 * The prototype's YAML (web/index.html yamlLines, yamlScalar, yamlFold and parseYaml): a small subset that covers a
 * Daidal config (maps, lists, flow arrays and maps, folded blocks), so files move between the two frontends as they
 * are. A parse error carries the line it is about.
 */

export class YamlError extends Error {
	constructor(
		message: string,
		readonly line: number
	) {
		super(message);
	}
}

type Value = string | number | boolean | null | Value[] | { [k: string]: Value };

export function yamlScalar(v: unknown): string {
	if (v === null || v === undefined) return 'null';
	if (typeof v === 'number') return String(v);
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	const s = typeof v === 'string' ? v : JSON.stringify(v);
	if (s === '') return '""';
	const plain = /^[A-Za-z][A-Za-z0-9 ._/·+()-]*$/.test(s) && !/\s$/.test(s) && !/^(y|n|yes|no|true|false|on|off|null|none)$/i.test(s);
	if (plain) return s;
	const escaped = s.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
	return `"${escaped}"`;
}

function fold(s: string, pad: string): string[] {
	const lines: string[] = [];
	let cur = '';
	for (const w of s.replace(/\s+/g, ' ').trim().split(' ')) {
		if (cur && `${cur} ${w}`.length > 68) {
			lines.push(cur);
			cur = w;
		} else cur = cur ? `${cur} ${w}` : w;
	}
	if (cur) lines.push(cur);
	return ['>-', ...lines.map(l => `${pad}  ${l}`)];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function arrayLines(k: string, v: unknown[], pad: string, ind: number): string[] {
	if (!v.length) return [`${pad}${k}: []`];
	if (v.every(x => x === null || typeof x !== 'object')) return [`${pad}${k}: [${v.map(yamlScalar).join(', ')}]`];
	const out = [`${pad}${k}:`];
	for (const item of v) {
		const ls = isObject(item) ? yamlLines(item, ind + 2) : [`${pad}    ${yamlScalar(item)}`];
		ls[0] = `${pad}  - ${ls[0].trimStart()}`;
		out.push(...ls);
	}
	return out;
}

/** An object as YAML lines, indented [ind] levels. */
export function yamlLines(obj: Record<string, unknown>, ind = 0): string[] {
	const pad = '  '.repeat(ind);
	const out: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined) continue;
		if (Array.isArray(v)) out.push(...arrayLines(k, v, pad, ind));
		else if (isObject(v)) {
			const vals = Object.values(v);
			if (vals.length && vals.every(x => typeof x === 'number')) {
				const pairs = Object.entries(v).map(([a, b]) => `${a}: ${String(b)}`);
				out.push(`${pad}${k}: { ${pairs.join(', ')} }`);
			}
			else out.push(`${pad}${k}:`, ...yamlLines(v, ind + 1));
		} else if (typeof v === 'string' && v.length > 68) {
			const f = fold(v, pad);
			out.push(`${pad}${k}: ${f[0]}`, ...f.slice(1));
		} else out.push(`${pad}${k}: ${yamlScalar(v)}`);
	}
	return out;
}

interface Line {
	n: number;
	ind: number;
	t: string;
}
const KEY = /^([A-Za-z0-9_.$-]+)\s*:(.*)$/;
/** Keys that would reach an object's prototype rather than the object; a config never needs them, so they're refused. */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const safeKey = (key: string, n: number): string => {
	if (FORBIDDEN.has(key)) throw new YamlError(`“${key}” can't be used as a key`, n);
	return key;
};

const wrapped = (s: string, open: string, close: string) => s.length >= 2 && s.startsWith(open) && s.endsWith(close);

/**
 * Splits the inside of a flow list or map at its own commas: those inside nested [ ] or { }, or inside quotes,
 * belong to the part they're in.
 */
function splitTop(body: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote = '';
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (quote) {
			if (c === '\\' && quote === '"') i++;
			else if (c === quote) quote = '';
		} else if (c === '"' || c === "'") quote = c;
		else if (c === '[' || c === '{') depth++;
		else if (c === ']' || c === '}') depth--;
		else if (c === ',' && depth === 0) {
			parts.push(body.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(body.slice(start));
	return parts;
}

/** A flow list ("[a, b]") or map ("{ x: 1 }"), nested ones included, or undefined if [s] is neither. */
function flow(s: string, n: number): Value | undefined {
	if (wrapped(s, '[', ']')) {
		const b = s.slice(1, -1).trim();
		return b === '' ? [] : splitTop(b).map(x => scalar(x, n));
	}
	if (!wrapped(s, '{', '}')) return undefined;
	const o: Record<string, Value> = {};
	const b = s.slice(1, -1).trim();
	for (const pair of b ? splitTop(b) : []) {
		const i = pair.indexOf(':');
		if (i < 0) throw new YamlError('Expected “key: value” inside { }', n);
		o[safeKey(pair.slice(0, i).trim(), n)] = scalar(pair.slice(i + 1), n);
	}
	return o;
}

/** A number, true, false or null, or undefined if [s] is none of those. */
function literal(s: string): Value | undefined {
	if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10);
	if (/^-?\d*\.\d+$/.test(s)) return Number.parseFloat(s);
	if (/^(true|yes)$/i.test(s)) return true;
	if (/^(false|no)$/i.test(s)) return false;
	if (/^(null|~)$/i.test(s)) return null;
	return undefined;
}

function scalar(raw: string, n: number): Value {
	const s = raw.trim();
	if (s === '') return '';
	if (wrapped(s, '"', '"')) return s.slice(1, -1).replaceAll(String.raw`\"`, '"').replaceAll(String.raw`\\`, '\\');
	if (wrapped(s, "'", "'")) return s.slice(1, -1);
	const value = flow(s, n) ?? literal(s);
	if (value !== undefined) return value;
	// A comment after the value ends it.
	const hash = s.search(/\s#/);
	return hash < 0 ? s : s.slice(0, hash).trimEnd();
}

/** Reads the YAML subset; throws a YamlError with the line number on anything it can't read. */
export function parseYaml(text: string): Value {
	const L: Line[] = [];
	text
		.replaceAll('\r', '')
		.replaceAll('\t', '  ')
		.split('\n')
		.forEach((t, i) => {
			if (t.trim() !== '' && !/^\s*#/.test(t)) L.push({ n: i + 1, ind: /^ */.exec(t)![0].length, t: t.trim() });
		});
	if (!L.length) throw new YamlError('Nothing to read: the config is empty', 1);
	let p = 0;

	const nested = (ind: number): Value | null => {
		if (p >= L.length || L[p].ind <= ind) return null;
		return L[p].t.startsWith('-') ? list(L[p].ind) : map(L[p].ind);
	};
	const assign = (obj: Record<string, Value>, key: string, rest: string, n: number, ind: number) => {
		safeKey(key, n);
		const r = rest.trim();
		if (r === '') {
			obj[key] = nested(ind) ?? '';
			return;
		}
		if (/^[>|]-?$/.test(r)) {
			const parts: string[] = [];
			while (p < L.length && L[p].ind > ind) parts.push(L[p++].t);
			obj[key] = parts.join(r.startsWith('>') ? ' ' : '\n');
			return;
		}
		obj[key] = scalar(r, n);
	};
	const item = (cur: number): Value => {
		const n = L[p].n;
		const body = L[p].t.slice(1).trim();
		p++;
		if (body === '') return nested(cur);
		const kv = KEY.exec(body);
		if (!kv) return scalar(body, n);
		const obj: Record<string, Value> = {};
		assign(obj, kv[1], kv[2], n, cur + 2);
		while (p < L.length && L[p].ind > cur && !L[p].t.startsWith('-')) {
			const m = KEY.exec(L[p].t);
			if (!m) throw new YamlError('Expected “key: value”', L[p].n);
			const { n: nn, ind: ii } = L[p++];
			assign(obj, m[1], m[2], nn, ii);
		}
		return obj;
	};
	const list = (cur: number): Value[] => {
		const out: Value[] = [];
		while (p < L.length && L[p].ind === cur && L[p].t.startsWith('-')) out.push(item(cur));
		return out;
	};
	const map = (cur: number): Record<string, Value> => {
		const out: Record<string, Value> = {};
		while (p < L.length && L[p].ind === cur) {
			if (L[p].t.startsWith('-')) throw new YamlError(`Unexpected list item: “${L[p].t.slice(0, 24)}”`, L[p].n);
			const m = KEY.exec(L[p].t);
			if (!m) throw new YamlError(`Expected “key: value”: “${L[p].t.slice(0, 24)}”`, L[p].n);
			const { n, ind } = L[p++];
			assign(out, m[1], m[2], n, ind);
		}
		return out;
	};
	const doc = L[0].t.startsWith('-') ? list(L[0].ind) : map(L[0].ind);
	if (p < L.length) throw new YamlError('The indentation does not line up with the block above', L[p].n);
	return doc;
}
