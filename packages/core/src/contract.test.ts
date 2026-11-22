import { describe, expect, it } from 'vitest';
import { configText, readConfig, type ConfigLang } from './config';
import { EVERY_FIELD, type Full } from './fixtures';
import { ICON_PATHS } from './icons';
import { esc, toSvg } from './render';
import { tagsOn, toScene } from './model';
import { renderConfig } from './index';
import type { DocFunction, DocNode, DaidalDoc } from './types';

/**
 * The document contract: every field of the format reaches every output. EVERY_FIELD sets each field (its type makes
 * that a typecheck error to forget), and the ledgers below say, field by field, what the SVG export shows of it, or
 * why it shows nothing. A field added to DocNode or DocFunction fails the typecheck here until it has a line, so
 * nobody adds to the model without deciding what the renderer and the exports do with it.
 *
 * The canvas card (app/src/lib/components/NodeCard.svelte) and the SVG both lay code blocks out from model.ts
 * (codeSections, codeHeight, CODE), so a code block's size and lines agree wherever it is drawn.
 */

type Node = Full<DocNode>;
/** What the SVG shows of a field: text or markup it must contain, or why it shows nothing. */
type Shown<T> = { svg: (v: T) => string[] } | { notDrawn: string };

const NODE_FIELDS: { [K in keyof DocNode]-?: Shown<Node> } = {
	id: { notDrawn: 'an id is what connections refer to' },
	name: { svg: n => [`>${esc(n.name)}<`] },
	type: { svg: n => [`>${n.type.toUpperCase()}<`] },
	icon: { svg: n => [`d="${ICON_PATHS[n.icon]}"`] },
	subtitle: { svg: n => [`>${esc(n.subtitle)}<`] },
	flags: { notDrawn: 'a code block has no flag row; plain cards draw flags' },
	tags: { svg: () => ['fill="#b5abfc"'] },
	layout: { svg: n => [`x="${n.layout.x}" y="${n.layout.y}" width="${n.layout.w}"`] },
	notes: { notDrawn: "a code block's notes show in its hover card and details, not on the card" },
	members: { svg: n => n.members.map(m => `>${esc(m)}<`) },
	functions: { svg: n => n.functions.map(f => `>${esc(f.name)}<tspan`) },
	path: { svg: n => [`>${esc(n.path)}<`] },
	links: { notDrawn: 'links open from the canvas; an image has nothing to click' },
	ref: { notDrawn: 'a ref ties the node to another diagram; it draws nothing' }
};

const FUNCTION_FIELDS: { [K in keyof DocFunction]-?: Shown<Full<DocFunction>> } = {
	name: { svg: f => [`>${esc(f.name)}<tspan`] },
	params: { svg: f => f.params.map(p => esc(`${p.name}: ${p.type}`)) },
	returns: { svg: f => [esc(f.returns)] },
	notes: { notDrawn: "a function's note shows as the canvas line's tooltip and in the details" }
};

const LANGS: ConfigLang[] = ['yaml', 'json'];

describe('the document contract', () => {
	const node = EVERY_FIELD.nodes[0];
	const scene = toScene(EVERY_FIELD);
	const { svg } = toSvg(scene, { on: tagsOn(scene, null) });

	it('draws every field of a code block that the ledger says the SVG shows', () => {
		expect(scene.nodes[0].code).toBe(true);
		for (const [field, shown] of Object.entries(NODE_FIELDS)) {
			if ('svg' in shown) for (const s of shown.svg(node)) expect(svg, `node.${field}`).toContain(s);
		}
		for (const f of node.functions) {
			for (const [field, shown] of Object.entries(FUNCTION_FIELDS)) {
				if ('svg' in shown) for (const s of shown.svg(f)) expect(svg, `function ${f.name}.${field}`).toContain(s);
			}
		}
	});

	it.each(LANGS)('exports every field to %s and reads it back unchanged', lang => {
		const text = configText(EVERY_FIELD, lang);
		expect(readConfig(text, EVERY_FIELD, 'replace').doc).toEqual(EVERY_FIELD);
	});

	it.each(LANGS)('draws an exported %s config the same as the diagram it came from', lang => {
		// The npm bundle's entry point (what the Claude skill and other integrations call) against the app's own path.
		// A config never renames the diagram it is read into, so only the title, the diagram's name, differs.
		const fromConfig = renderConfig(configText(EVERY_FIELD, lang));
		expect(fromConfig.svg).toBe(svg.replace(`<title>${EVERY_FIELD.diagram.name}</title>`, '<title></title>'));
	});

	it('keeps EVERY_FIELD a valid document', () => {
		const doc: DaidalDoc = EVERY_FIELD;
		expect(doc.nodes?.[0].functions?.length).toBeGreaterThan(0);
	});
});
