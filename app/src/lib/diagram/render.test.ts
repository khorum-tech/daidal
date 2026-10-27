import { describe, expect, it } from 'vitest';
import { esc, exportName, toSvg } from './render';
import { tagsOn, toScene } from './model';
import { SAMPLE } from '../fixtures/docs';

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
