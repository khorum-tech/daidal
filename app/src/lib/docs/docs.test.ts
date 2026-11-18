import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { docImages, docLinks, neighbours, PAGES, pageOf, parsePage, render } from './docs';

describe('the docs pages', () => {
	it('each have a title, a summary and their own slug, in order', () => {
		expect(PAGES.length).toBeGreaterThanOrEqual(10);
		for (const p of PAGES) {
			expect(p.title, p.slug).not.toBe(p.slug);
			expect(p.summary, p.slug).not.toBe('');
			expect(p.body, p.slug).toMatch(/^# /);
		}
		expect(new Set(PAGES.map(p => p.slug)).size).toBe(PAGES.length);
		expect(PAGES[0].slug).toBe('getting-started');
		expect(PAGES.map(p => p.order)).toEqual([...PAGES.map(p => p.order)].sort((a, b) => a - b));
	});

	it('only link to pages that exist', () => {
		for (const p of PAGES) for (const slug of docLinks(p.body)) expect(pageOf(slug), `${p.slug} → ${slug}`).toBeDefined();
	});

	it('show only pictures that exist, with words for each, and every picture taken is shown', () => {
		const files = readdirSync(new URL('../../../static/docs-images', import.meta.url)).filter(f => f.endsWith('.png'));
		const shown = PAGES.flatMap(p => docImages(p.body));
		for (const name of shown) expect(files, name).toContain(name);
		expect([...new Set(shown)].sort()).toEqual([...files].sort());
		for (const p of PAGES) for (const m of p.body.matchAll(/!\[([^\]]*)\]\(/g)) expect(m[1].length, p.slug).toBeGreaterThan(10);
	});

	it('know their neighbours', () => {
		expect(neighbours('getting-started').prev).toBeUndefined();
		expect(neighbours('getting-started').next).toBe(PAGES[1]);
		expect(neighbours(PAGES.at(-1)!.slug).next).toBeUndefined();
		expect(neighbours('nope')).toEqual({});
	});
});

describe('a page', () => {
	it('reads its header, and falls back without one', () => {
		expect(parsePage('x', '---\ntitle: Hello: world\nsummary: Hi\norder: 3\n---\n# Hello\n')).toEqual({
			slug: 'x',
			title: 'Hello: world',
			summary: 'Hi',
			order: 3,
			body: '# Hello\n'
		});
		expect(parsePage('bare', 'Just text')).toEqual({ slug: 'bare', title: 'bare', summary: '', order: 999, body: 'Just text' });
	});

	it('renders as HTML, tables and code included', () => {
		const html = render('# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```yaml\nk: v\n```\n\n[Nodes](/app/docs/nodes)');
		expect(html).toContain('<h1>T</h1>');
		expect(html).toContain('<table>');
		expect(html).toContain('<code class="language-yaml">');
		expect(html).toContain('href="/app/docs/nodes"');
	});
});

describe('the config page’s example', () => {
	it('is a config Daidal reads', async () => {
		const { readConfig } = await import('@khorum-oss/daidal-core/config');
		const yaml = /```yaml\n([\s\S]*?)```/.exec(pageOf('config')!.body)![1];
		const { doc } = readConfig(yaml, { version: 1 }, 'replace');
		expect(doc.nodes!.map(n => n.id)).toEqual(['web', 'api', 'db']);
		expect(doc.edges).toHaveLength(2);
		expect(doc.boundaries![0]).toMatchObject({ id: 'vpc', label: 'Production VPC' });
		expect(doc.nodes![1].links).toEqual([{ label: 'Runbook', url: 'https://example.com/runbook' }]);
	});
});
