import { describe, expect, it } from 'vitest';
import { esc, exportName, toSvg } from './render';
import { tagsOn, toScene } from './model';
import { SAMPLE } from './fixtures';

const scene = toScene(SAMPLE);

describe('toSvg', () => {
	it('draws every node, connection label and container, sized to the diagram with a margin', () => {
		const { svg, width, height } = toSvg(scene, { on: tagsOn(scene, null) });
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
		expect(width).toBeGreaterThan(800);
		expect(height).toBeGreaterThan(400);
		for (const n of scene.nodes) expect(svg).toContain(`>${esc(n.name)}<`);
		for (const e of scene.edges.filter(x => x.showLabel && x.label)) expect(svg).toContain(`>${esc(e.label)}<`);
		expect(svg).toContain('>PROD<');
	});

	it('ghosts what the view switches off, or leaves it out', () => {
		const on = tagsOn(scene, 'Request path');
		const off = scene.nodes.find(n => n.tags.length && !n.tags.some(t => on[t]))!;
		const ghosted = toSvg(scene, { on }).svg;
		expect(ghosted).toContain(`>${esc(off.name)}<`);
		expect(ghosted).toContain('opacity="0.22"');
		expect(toSvg(scene, { on, ghosted: false }).svg).not.toContain(`>${esc(off.name)}<`);
	});

	it('escapes text and keeps file names safe', () => {
		expect(esc('A & <B> "c"')).toBe('A &amp; &lt;B&gt; &quot;c&quot;');
		expect(exportName('ledger platform / v2', 'png')).toBe('ledger-platform-v2.png');
		expect(exportName('  ', 'svg')).toBe('diagram.svg');
	});
});

describe('toSvg and tag colours', () => {
	it('never writes a tag colour into the SVG as markup', () => {
		const doc = { version: 1 as const, tags: { a: { label: 'A', color: '#abcdef' } }, nodes: [{ id: 'n', name: 'N', type: 'service', tags: ['a'], layout: { x: 0, y: 0 } }] };
		const scene = toScene(doc);
		expect(toSvg(scene, { on: tagsOn(scene, null) }).svg).toContain('fill="#abcdef"');
		// toScene already turns a bad colour grey; the SVG escapes it as well, in case a scene comes from elsewhere.
		scene.tags[0].color = '"/><script>alert(1)</script>';
		expect(toSvg(scene, { on: tagsOn(scene, null) }).svg).not.toContain('<script>');
	});
});

describe('toSvg and sticky notes', () => {
	it('draws a note as a tinted card with its heading and every line of its notes, escaped', () => {
		const scene = toScene({
			version: 1,
			nodes: [{ id: 'n', name: 'Why <Postgres>', type: 'note', notes: 'Ledger needs transactions & joins.\nRevisit in Q3.', layout: { x: 0, y: 0, w: 220 } }]
		});
		const { svg } = toSvg(scene, { on: tagsOn(scene, null) });
		expect(svg).toContain('Why &lt;Postgres&gt;');
		// Wrapped to the card's width.
		expect(svg).toContain('>Ledger needs transactions &amp;<');
		expect(svg).toContain('>joins.<');
		expect(svg).toContain('Revisit in Q3.');
		expect(svg).toContain('fill="#3a3730"');
		// No type label or icon on a note.
		expect(svg).not.toContain('>NOTE<');
	});
});

describe('toSvg and C4 cards', () => {
	it('draws a C4 card with its name, element line and description, escaped, and a person with a head', () => {
		const scene = toScene({
			version: 1,
			diagram: { kind: 'c4-container' },
			nodes: [
				{ id: 'api', name: 'Postings <API>', type: 'service', subtitle: 'Kotlin & Ktor', notes: 'Posts entries.', layout: { x: 0, y: 0 } },
				{ id: 'who', name: 'Staff', type: 'actor', layout: { x: 300, y: 0 } }
			]
		});
		const { svg } = toSvg(scene, { on: tagsOn(scene, null) });
		expect(svg).toContain('>Postings &lt;API&gt;<');
		expect(svg).toContain('>[Container: Kotlin &amp; Ktor]<');
		expect(svg).toContain('>Posts entries.<');
		expect(svg).toContain('>[Person]<');
		expect(svg).toMatch(/<circle cx="395"/);
		// No type label in C4 notation.
		expect(svg).not.toContain('>SERVICE<');
	});
});

describe('toSvg and C4 text placement', () => {
	it('centres a C4 card text in the room under the head', () => {
		const scene = toScene({ version: 1, diagram: { kind: 'c4-context' }, nodes: [{ id: 'p', name: 'Staff', type: 'actor', layout: { x: 0, y: 0, h: 200 } }] });
		const { svg } = toSvg(scene, { on: tagsOn(scene, null) });
		const ys = [...svg.matchAll(/<text x="95" y="([\d.]+)"/g)].map(m => Number(m[1]));
		// Name then [Person]: 18 + 15 tall, in the room from 26 (under the head) to 188 (above the bottom padding).
		const top = ys[0] - 9;
		const bottom = ys[1] + 7.5;
		expect(Math.abs(top - 26 - (188 - bottom))).toBeLessThan(1);
	});
});
