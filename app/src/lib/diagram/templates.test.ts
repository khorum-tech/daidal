import { describe, expect, it } from 'vitest';
import { toScene } from './model';
import { fromTemplate, TEMPLATES } from './templates';

describe('templates', () => {
	it('are whole documents: every connection and view points at what is there', () => {
		expect(TEMPLATES.map(t => t.name)).toEqual(['C4 Container', 'C4 Context', 'Deployment topology', 'Freeform']);
		for (const t of TEMPLATES) {
			const ids = new Set(t.doc.nodes?.map(n => n.id));
			expect(t.doc.edges?.every(e => ids.has(e.from) && ids.has(e.to))).toBe(true);
			const tags = Object.keys(t.doc.tags ?? {});
			expect(t.doc.views?.every(v => v.tags.every(k => tags.includes(k)))).toBe(true);
			expect(toScene(t.doc).initialView).toBe(t.doc.views?.[0]?.name ?? null);
		}
	});

	it('start a diagram with the examples, or just the tags, views and kind', () => {
		const deploy = TEMPLATES.find(t => t.id === 'deploy')!;
		const full = fromTemplate('ops', deploy, true);
		expect(full.diagram).toMatchObject({ name: 'ops', kind: 'Infra' });
		expect(full.nodes).toHaveLength(4);
		expect(full.boundaries).toHaveLength(1);
		const bare = fromTemplate('ops', deploy, false);
		expect(bare).toMatchObject({ nodes: [], edges: [], tags: deploy.doc.tags, views: deploy.doc.views });
		expect(bare.boundaries).toBeUndefined();
		expect(deploy.doc.nodes).toHaveLength(4);
		expect(fromTemplate('blank', null, true)).toEqual({ version: 1, diagram: { name: 'blank' } });
	});
});
