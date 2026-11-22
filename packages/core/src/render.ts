import { edgePath, type Box } from './geometry';
import { ICON_PATHS } from './icons';
import { borderWidth, bounds, C4, c4Desc, c4Kind, c4Name, c4Text, c4Top, isHidden, MARKER, NOTE, noteLines, wrapText, type Scene, type SceneNode } from './model';

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
