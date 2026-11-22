import { edgePath, type Box } from './geometry';
import { ICON_PATHS } from './icons';
import { signatureParts } from './code';
import { keyLabel, tableRows, tableWidths, TABLE, toKey } from './table';
import { borderWidth, bounds, C4, CODE, codeSections, fitMono, c4Desc, c4Kind, c4Name, c4Text, c4Top, isHidden, MARKER, NOTE, noteLines, wrapText, type Scene, type SceneNode } from './model';

/**
 * A diagram as a standalone SVG image, drawn from the scene the way the canvas draws it: containers, connections
 * with their labels, then nodes. What the view switches off is ghosted, as on the canvas, or left out. The colours
 * are the canvas's own (Nocturne), so an export looks like the screen.
 */

export interface RenderOptions {
	/** Tags switched on; a node with none of its tags on is ghosted, or left out. */
	on: Record<string, boolean>;
	/** Keep what the view switches off, faintly, instead of leaving it out. */
	ghosted?: boolean;
	edgeStyle?: 'curved' | 'straight' | 'angled';
}

const C = {
	bg: '#161826',
	surface: '#232532',
	text: '#e9e9ed',
	accent: '#9184d9',
	border: '#3f424d',
	muted: '#9397ab',
	faint: '#75798c',
	line: '#595d6c',
	note: '#3a3730',
	noteBorder: '#6b5f3e',
	/** C4 fills by role, as the canvas mixes them from the accent (Nocturne). */
	c4: { person: '#3e3a58', system: '#3e3a58', container: '#363449', store: '#363449', component: '#2c2d3c', external: '#34363f' },
	c4Border: '#6a62a0',
	c4External: '#4a4d5a'
};
const FONT = 'Inter, system-ui, -apple-system, Segoe UI, sans-serif';
const PAD = 40;
const GHOST = 0.22;

/** Text made safe for SVG markup. */
export function esc(s: string): string {
	return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** About how many characters fit in [w] pixels at [size]; longer text is cut with an ellipsis. */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function fit(text: string, w: number, size: number): string {
	const max = Math.max(1, Math.floor(w / (size * 0.56)));
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Where a container's label sits: on its top or bottom border (inside), or just beyond it (outside), left or right. */
function labelAt(b: Scene['boundaries'][number]): { x: number; y: number; anchor: 'start' | 'end' } {
	const [where, corner] = b.pos.split('-');
	const top = corner.startsWith('t');
	const left = corner.endsWith('l');
	const edge = top ? b.y : b.y + b.h;
	let out = 0;
	if (where === 'outside') out = top ? -12 : 12;
	return { x: left ? b.x + 10 : b.x + b.w - 10, y: edge + out, anchor: left ? 'start' : 'end' };
}

const BORDER_DASH: Record<string, string> = { solid: '', dashed: ' stroke-dasharray="6 5"', dotted: ' stroke-dasharray="1.5 4" stroke-linecap="round"' };

/** An SVG attribute, or nothing when there is no value. */
const attr = (name: string, value: string | null | undefined) => (value ? ` ${name}="${value}"` : '');

function boundaryMarkup(scene: Scene): string {
	return scene.boundaries
		.map(b => {
			const dash = BORDER_DASH[b.bs];
			const rect = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="none" stroke="${C.line}" stroke-width="${borderWidth(b.bw)}"${dash}/>`;
			if (!b.label) return rect;
			const { x, y, anchor } = labelAt(b);
			const label = `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" letter-spacing="1.2" fill="${C.faint}" paint-order="stroke" stroke="${C.bg}" stroke-width="6">${esc(b.label.toUpperCase())}</text>`;
			return rect + label;
		})
		.join('');
}

function edgeMarkup(scene: Scene, shown: (id: string) => number | null, edgeStyle: RenderOptions['edgeStyle']): string {
	const boxes = new Map<string, Box>([...scene.boundaries.map(b => [b.id, b] as const), ...scene.nodes.map(n => [n.id, n] as const)]);
	return scene.edges
		.flatMap(e => {
			const a = boxes.get(e.from);
			const b = boxes.get(e.to);
			const oa = shown(e.from);
			const ob = shown(e.to);
			if (!a || !b || oa === null || ob === null) return [];
			const op = Math.min(oa, ob) < 1 ? GHOST * 0.7 : 1;
			const p = edgePath(e, a, b, edgeStyle);
			const marks = attr('marker-end', p.markerEnd && `url(#${p.markerEnd})`) + attr('marker-start', p.markerStart && `url(#${p.markerStart})`);
			const line = `<path d="${p.d}" fill="none" stroke="${C.line}" stroke-width="${e.width}" stroke-linecap="${p.cap}"${attr('stroke-dasharray', p.dash)}${marks} opacity="${op}"/>`;
			const label =
				e.showLabel && e.label
					? `<text x="${p.lx}" y="${p.ly}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${C.muted}" paint-order="stroke" stroke="${C.bg}" stroke-width="6" opacity="${op}">${esc(e.label)}</text>`
					: '';
			return [line + label];
		})
		.join('');
}

/** A sticky note: a tinted card, the name as a heading and every line of the notes beneath it. */
function noteMarkup(n: SceneNode, dash: string): string {
	const x = n.x + NOTE.pad;
	let y = n.y + NOTE.pad;
	const text = (line: string, size: number, lineH: number, extra: string) => {
		const t = `<text x="${x}" y="${y + lineH / 2}" dominant-baseline="middle" font-size="${size}"${extra}>${esc(line)}</text>`;
		y += lineH;
		return t;
	};
	const head = wrapText(n.name, n.w - 2 * NOTE.pad, NOTE.headSize).map(l => text(l, NOTE.headSize, NOTE.headLine, ` font-weight="600" fill="${C.text}"`));
	if (n.desc.trim()) y += NOTE.gap;
	const body = noteLines(n.desc, n.w).map(l => text(l, NOTE.size, NOTE.line, ` fill="${C.muted}" xml:space="preserve"`));
	return `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${C.note}" stroke="${C.noteBorder}"${dash}/>` + head.join('') + body.join('');
}

/** A card in C4 notation: the name, its element line and its description, centred, in its role's fill and shape. */
function c4Markup(n: SceneNode, dash: string, edge: string | undefined): string {
	const role = n.c4!.role;
	const fill = C.c4[role];
	const stroke = role === 'external' ? C.c4External : C.c4Border;
	const cx = n.x + n.w / 2;
	// Centred in the room under the head or rim, as the canvas card's flex column does.
	const room = n.h - c4Top(role) - C4.pad;
	let y = n.y + c4Top(role) + Math.max(0, (room - c4Text(n.name, n.c4!.line, n.c4!.desc, n.w)) / 2);
	const text = (line: string, size: number, lineH: number, extra: string) => {
		const t = `<text x="${cx}" y="${y + lineH / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" xml:space="preserve"${extra}>${esc(line)}</text>`;
		y += lineH;
		return t;
	};
	const corner = role === 'person' ? 22 : 10;
	let shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${corner}" fill="${fill}" stroke="${stroke}"${dash}/>`;
	if (role === 'store') {
		shape =
			`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.w / 2}" ry="14" fill="${fill}" stroke="${stroke}"${dash}/>` +
			`<ellipse cx="${cx}" cy="${n.y + 14}" rx="${n.w / 2}" ry="${C4.rim}" fill="none" stroke="${stroke}"/>`;
	}
	const head = role === 'person' ? `<circle cx="${cx}" cy="${n.y + 3}" r="17" fill="${fill}" stroke="${stroke}"/>` : '';
	const mark = edge ? `<rect x="${n.x}" y="${n.y + 10}" width="3" height="${Math.max(0, n.h - 20)}" fill="${esc(edge)}"/>` : '';
	const name = c4Name(n.name, n.w).map(l => text(l, C4.nameSize, C4.nameLine, ` font-weight="600" fill="${C.text}"`));
	const kind = c4Kind(n.c4!.line, n.w).map(l => text(l, C4.kindSize, C4.kindLine, ` fill="${C.muted}"`));
	const about = n.c4!.desc;
	if (about.trim()) y += C4.gap;
	const desc = about.trim() ? c4Desc(about, n.w).map(l => text(l, C4.descSize, C4.descLine, ` fill="${C.text}"`)) : [];
	return shape + head + mark + name.join('') + kind.join('') + desc.join('');
}

/** A code block: the type row, the name in monospace, the purpose and path, then a rule and the members, a line each. */
function codeMarkup(n: SceneNode, dash: string, icon: string, tag: string | undefined): string {
	const x = n.x + CODE.padX;
	const w = n.w - 2 * CODE.padX;
	let y = n.y + 1 + CODE.padY + CODE.head + CODE.nameTop;
	const row = (line: string, lineH: number, extra: string) => {
		const t = `<text x="${x}" y="${y + lineH / 2}" dominant-baseline="middle" xml:space="preserve"${extra}>${esc(line)}</text>`;
		y += lineH;
		return t;
	};
	const out = [
		`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${C.surface}" stroke="${C.border}"${dash}/>`,
		`<path transform="translate(${x} ${n.y + 11}) scale(${15 / 256})" d="${icon}" fill="${C.accent}"/>`,
		`<text x="${n.x + 36}" y="${n.y + 19}" dominant-baseline="middle" font-size="9.5" letter-spacing="0.95" fill="${C.muted}">${esc(fit(n.type.toUpperCase(), n.w - 70, 9.5))}</text>`,
		tag ? `<circle cx="${n.x + n.w - 16}" cy="${n.y + 18}" r="3.5" fill="${esc(tag)}"/>` : '',
		row(fitMono(n.name, w, CODE.nameSize), CODE.nameLine, ` font-family="${MONO}" font-size="${CODE.nameSize}" font-weight="600" fill="${C.text}"`)
	];
	if (n.sub.trim()) {
		y += CODE.subTop;
		out.push(row(fit(n.sub, w, 11.5), CODE.subLine, ` font-size="11.5" fill="${C.muted}"`));
	}
	if (n.path) {
		y += CODE.pathTop;
		out.push(row(fitMono(n.path, w, CODE.pathSize, true), CODE.pathLine, ` font-family="${MONO}" font-size="${CODE.pathSize}" fill="${C.faint}"`));
	}
	const sigs = n.functions.map(f => signatureParts(f, n.language));
	const parts = codeSections(n.members, sigs.map(s => s.lead + s.name + s.rest));
	const rule = () => {
		y += CODE.ruleTop;
		out.push(`<line x1="${n.x}" y1="${y + 0.5}" x2="${n.x + n.w}" y2="${y + 0.5}" stroke="${C.border}"/>`);
		y += 1 + CODE.ruleBottom;
	};
	const more = (count: number) => row(`+${count} more`, CODE.line, ` font-size="11" fill="${C.muted}"`);
	const mono = ` font-family="${MONO}" font-size="${CODE.size}"`;
	if (parts.members.shown.length || parts.members.more) {
		rule();
		for (const m of parts.members.shown) out.push(row(fitMono(m, w, CODE.size), CODE.line, `${mono} fill="${C.text}"`));
		if (parts.members.more) out.push(more(parts.members.more));
	}
	if (parts.functions.shown.length || parts.functions.more) {
		rule();
		// A signature's name in the text colour, what comes before it (a return type, the word that starts a
		// definition) and after it (parameters, return type) quieter, as the canvas card draws it.
		parts.functions.shown.forEach((sig, i) => {
			const line = fitMono(sig, w, CODE.size);
			const leadLen = Math.min(sigs[i].lead.length, line.length);
			const lead = line.slice(0, leadLen);
			const name = line.slice(leadLen, leadLen + sigs[i].name.length);
			const rest = line.slice(leadLen + sigs[i].name.length);
			const quiet = (t: string) => (t ? `<tspan fill="${C.muted}">${esc(t)}</tspan>` : '');
			const t = `<text x="${x}" y="${y + CODE.line / 2}" dominant-baseline="middle" xml:space="preserve"${mono} fill="${C.text}">${quiet(lead)}${esc(name)}${quiet(rest)}</text>`;
			y += CODE.line;
			out.push(t);
		});
		if (parts.functions.more) out.push(more(parts.functions.more));
	}
	return out.join('');
}

/**
 * A table block: the type row, the table's name in monospace and its subtitle, then a rule and a row for each column:
 * its key's badge, its name, and its data type at the right, quieter. Rows past the first get a faint rule above.
 */
function tableMarkup(n: SceneNode, dash: string, icon: string, tag: string | undefined): string {
	const x = n.x + TABLE.padX;
	const w = n.w - 2 * TABLE.padX;
	let y = n.y + 1 + TABLE.padY + TABLE.head + TABLE.nameTop;
	const mono = ` font-family="${MONO}"`;
	const out = [
		`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${C.surface}" stroke="${C.border}"${dash}/>`,
		`<path transform="translate(${x} ${n.y + 11}) scale(${15 / 256})" d="${icon}" fill="${C.accent}"/>`,
		`<text x="${n.x + 36}" y="${n.y + 19}" dominant-baseline="middle" font-size="9.5" letter-spacing="0.95" fill="${C.muted}">${esc(fit(n.type.toUpperCase(), n.w - 70, 9.5))}</text>`,
		tag ? `<circle cx="${n.x + n.w - 16}" cy="${n.y + 18}" r="3.5" fill="${esc(tag)}"/>` : '',
		`<text x="${x}" y="${y + TABLE.nameLine / 2}" dominant-baseline="middle" xml:space="preserve"${mono} font-size="${TABLE.nameSize}" font-weight="600" fill="${C.text}">${esc(fitMono(n.name, w, TABLE.nameSize))}</text>`
	];
	y += TABLE.nameLine;
	if (n.sub.trim()) {
		y += TABLE.subTop;
		out.push(`<text x="${x}" y="${y + TABLE.subLine / 2}" dominant-baseline="middle" font-size="11.5" fill="${C.muted}">${esc(fit(n.sub, w, 11.5))}</text>`);
		y += TABLE.subLine;
	}
	const { shown, more } = tableRows(n.columns);
	const widths = tableWidths(n.columns, n.w);
	y += TABLE.ruleTop;
	const rows = [...shown.map(c => ({ c, more: 0 })), ...(more ? [{ c: null, more }] : [])];
	rows.forEach((r, i) => {
		out.push(`<line x1="${n.x}" y1="${y + 0.5}" x2="${n.x + n.w}" y2="${y + 0.5}" stroke="${C.border}"${i ? ' stroke-opacity="0.55"' : ''}/>`);
		const mid = y + TABLE.row / 2 + 0.5;
		if (r.c) {
			const key = keyLabel(r.c.key);
			if (key) out.push(`<text x="${x}" y="${mid}" dominant-baseline="middle" font-size="${TABLE.keySize}" font-weight="700" letter-spacing="0.4" fill="${toKey(r.c.key) === 'pk' ? C.accent : C.muted}">${key}</text>`);
			const weight = toKey(r.c.key) === 'pk' ? ' font-weight="600"' : '';
			out.push(`<text x="${x + widths.key}" y="${mid}" dominant-baseline="middle" xml:space="preserve"${mono} font-size="${TABLE.size}"${weight} fill="${C.text}">${esc(fitMono(r.c.name, widths.name, TABLE.size))}</text>`);
			if (r.c.type && widths.type) out.push(`<text x="${n.x + n.w - TABLE.padX}" y="${mid}" text-anchor="end" dominant-baseline="middle" xml:space="preserve"${mono} font-size="${TABLE.size}" fill="${C.muted}">${esc(fitMono(r.c.type, widths.type, TABLE.size))}</text>`);
		} else {
			out.push(`<text x="${x}" y="${mid}" dominant-baseline="middle" font-size="11" fill="${C.muted}">+${r.more} more</text>`);
		}
		y += TABLE.row;
	});
	return out.join('');
}

function nodeMarkup(scene: Scene, shown: (id: string) => number | null): string {
	const tagColor = new Map(scene.tags.map(t => [t.key, t.color]));
	return scene.nodes
		.flatMap(n => {
			const op = shown(n.id);
			if (op === null) return [];
			const g = (body: string) => `<g opacity="${op}">${body}</g>`;
			if (n.isText) {
				return [g(`<text x="${n.x + 10}" y="${n.y + n.h / 2}" dominant-baseline="middle" font-size="17" font-weight="500" fill="${C.text}">${esc(fit(n.name, n.w - 20, 17))}</text>`)];
			}
			const dash = op < 1 ? ' stroke-dasharray="4 3"' : '';
			if (n.isNote) return [g(noteMarkup(n, dash))];
			if (n.c4) return [g(c4Markup(n, dash, n.tags[0] ? tagColor.get(n.tags[0]) : undefined))];
			const icon = ICON_PATHS[n.icon] ?? ICON_PATHS.cube;
			if (n.table) return [g(tableMarkup(n, dash, icon, n.tags[0] ? tagColor.get(n.tags[0]) : undefined))];
			if (n.code) return [g(codeMarkup(n, dash, icon, n.tags[0] ? tagColor.get(n.tags[0]) : undefined))];
			const dot = n.tags[0] && tagColor.get(n.tags[0]) ? `<circle cx="${n.x + n.w - 16}" cy="${n.y + 18}" r="3.5" fill="${esc(tagColor.get(n.tags[0])!)}"/>` : '';
			const sub = n.sub.trim() ? `<text x="${n.x + 13}" y="${n.y + 66}" font-size="11.5" fill="${C.muted}">${esc(fit(n.sub, n.w - 26, 11.5))}</text>` : '';
			return [
				g(
					`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${C.surface}" stroke="${C.border}"${dash}/>` +
						`<path transform="translate(${n.x + 13} ${n.y + 11}) scale(${15 / 256})" d="${icon}" fill="${C.accent}"/>` +
						`<text x="${n.x + 36}" y="${n.y + 19}" dominant-baseline="middle" font-size="9.5" letter-spacing="0.95" fill="${C.muted}">${esc(fit(n.type.toUpperCase(), n.w - 70, 9.5))}</text>` +
						dot +
						`<text x="${n.x + 13}" y="${n.y + 47}" font-size="15" font-weight="500" fill="${C.text}">${esc(fit(n.name, n.w - 26, 15))}</text>` +
						sub
				)
			];
		})
		.join('');
}

const MARKERS = [
	['arrThin', 1.1, '#75798c'],
	['arr', 1.4, '#75798c'],
	['arrBold', 1.9, '#8c90a3']
] as const;

/** The SVG, sized to the diagram with a margin, and its size. */
export function toSvg(scene: Scene, { on, ghosted = true, edgeStyle = 'curved' }: RenderOptions): { svg: string; width: number; height: number } {
	const hidden = (id: string) => {
		const n = scene.nodes.find(x => x.id === id);
		return !!n && isHidden(n, on);
	};
	// 1 shown, a fraction ghosted, null left out.
	const faded = ghosted ? GHOST : null;
	const shown = (id: string) => (hidden(id) ? faded : 1);
	const keep = { ...scene, nodes: scene.nodes.filter(n => shown(n.id) !== null) };
	const box = bounds(keep.nodes.length || keep.boundaries.length ? keep : scene);
	const x0 = box.x - PAD;
	const y0 = box.y - PAD;
	const width = Math.ceil(box.w + 2 * PAD);
	const height = Math.ceil(box.h + 2 * PAD);
	const markers = MARKERS.map(
		([id, w, c]) =>
			`<marker id="${id}" viewBox="0 0 7 6" markerWidth="${MARKER.w}" markerHeight="${MARKER.h}" refX="5.9" refY="3" markerUnits="userSpaceOnUse" orient="auto"><path d="M0.6,0.5L5.9,3L0.6,5.5" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></marker>` +
			`<marker id="${id.replace('arr', 'arrRev')}" viewBox="0 0 7 6" markerWidth="${MARKER.w}" markerHeight="${MARKER.h}" refX="1.1" refY="3" markerUnits="userSpaceOnUse" orient="auto"><path d="M6.4,0.5L1.1,3L6.4,5.5" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></marker>`
	).join('');
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x0} ${y0} ${width} ${height}" font-family="${FONT}">` +
		`<title>${esc(scene.name)}</title>` +
		`<defs>${markers}</defs>` +
		`<rect x="${x0}" y="${y0}" width="${width}" height="${height}" fill="${C.bg}"/>` +
		boundaryMarkup(scene) +
		edgeMarkup(scene, shown, edgeStyle) +
		nodeMarkup(scene, shown) +
		`</svg>`;
	return { svg, width, height };
}

/** A file name for an export: the diagram's name, kept to safe characters. */
export function exportName(name: string, ext: string): string {
	const parts = name.trim().split(/[^\w.-]+/).filter(Boolean);
	const base = parts.join('-') || 'diagram';
	return `${base}.${ext}`;
}
