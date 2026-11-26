import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { docImages, docLinks, fillAddresses, imageSize, neighbours, PAGES, pageOf, parsePage, render, SITE } from './docs';
import IMAGE_SIZES from './image-sizes.json';
import { DAIDAL_SITE } from './site';

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

	it('know the size of every picture, as the files have it (npm run docs:shots keeps image-sizes.json up to date)', () => {
		const dir = new URL('../../../static/docs-images/', import.meta.url);
		const files = readdirSync(dir).filter(f => f.endsWith('.png'));
		expect(Object.keys(IMAGE_SIZES).sort()).toEqual([...files].sort());
		for (const name of files) {
			const png = readFileSync(new URL(name, dir));
			expect(png.toString('latin1', 12, 16), name).toBe('IHDR');
			expect(imageSize(`/app/docs-images/${name}`), name).toEqual([png.readUInt32BE(16), png.readUInt32BE(20)]);
		}
	});

	it('know their neighbours', () => {
		expect(neighbours('getting-started').prev).toBeUndefined();
		expect(neighbours('getting-started').next).toBe(PAGES[1]);
		expect(neighbours(PAGES.at(-1)!.slug).next).toBeUndefined();
		expect(neighbours('nope')).toEqual({});
	});
});

describe('the addresses in the docs', () => {
	const other = {
		url: 'https://diagrams.example.com',
		stageUrl: '',
		localUrl: 'http://localhost:9000',
		repoUrl: 'https://git.example.com/daidal'
	};

	it('are written as placeholders in the pages, and all filled in', () => {
		const dir = new URL('.', import.meta.url);
		for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
			const source = readFileSync(new URL(file, dir), 'utf8');
			expect(source, file).not.toMatch(/khorum\.org|github\.com\/khorum-tech\/daidal|localhost:\d+/);
		}
		for (const p of PAGES) expect(p.body, p.slug).not.toMatch(/\{\{\w+\}\}/);
	});

	it('give this build’s MCP addresses and commands on Connecting AI', () => {
		const body = pageOf('connecting-ai')!.body;
		expect(body).toContain(`| Daidal | \`${SITE.url}/mcp\` |`);
		if (SITE.stageUrl) expect(body).toContain(`| Stage | \`${SITE.stageUrl}/mcp\` |`);
		else expect(body).not.toContain('| Stage |');
		expect(body).toContain(`daidal ${SITE.url}/mcp\`, then`);
		expect(body).toContain(`daidal ${SITE.localUrl}/mcp --header`);
		expect(body).toContain(`](${SITE.repoUrl}/tree/main/skills/daidal-diagram)`);
	});

	it('follow another organisation’s settings, dropping a line whose address is empty', () => {
		const text = ['| Daidal | `{{DAIDAL_URL}}/mcp` |', '| Stage | `{{DAIDAL_STAGE_URL}}/mcp` |', 'Local: {{DAIDAL_LOCAL_URL}}, repo {{DAIDAL_REPO_URL}}'].join('\n');
		expect(fillAddresses(text, other)).toBe(
			['| Daidal | `https://diagrams.example.com/mcp` |', 'Local: http://localhost:9000, repo https://git.example.com/daidal'].join('\n')
		);
	});

	it('leave a name that isn’t an address as it is', () => {
		expect(fillAddresses('{{NOT_A_SETTING}} and {{DAIDAL_URL}}', DAIDAL_SITE)).toBe('{{NOT_A_SETTING}} and https://daidal.khorum.org');
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

	it('renders pictures that keep their place while loading, the first at once and the rest when near the screen', () => {
		const html = render('# T\n\n![The editor, with "tags" & views](/app/docs-images/editor.png)\n\n![The phone](/app/docs-images/phone-editor.png)\n\n![Elsewhere](https://example.com/x.png)');
		const imgs = html.match(/<img [^>]*>/g)!;
		expect(imgs).toHaveLength(3);
		expect(imgs[0]).toBe('<img src="/app/docs-images/editor.png" alt="The editor, with &quot;tags&quot; &amp; views" width="1280" height="800" decoding="async">');
		expect(imgs[1]).toBe('<img src="/app/docs-images/phone-editor.png" alt="The phone" width="824" height="1678" loading="lazy" decoding="async">');
		expect(imgs[2]).toBe('<img src="https://example.com/x.png" alt="Elsewhere" loading="lazy" decoding="async">');
		// Each page counts its own pictures.
		expect(render('![The editor again](/app/docs-images/editor.png)')).not.toContain('loading="lazy"');
	});
});

describe('the config page’s example', () => {
	it('is a config Daidal reads', async () => {
		const { readConfig } = await import('@khorum/daidal-core/config');
		const yaml = /```yaml\n([\s\S]*?)```/.exec(pageOf('config')!.body)![1];
		const { doc } = readConfig(yaml, { version: 1 }, 'replace');
		expect(doc.nodes!.map(n => n.id)).toEqual(['web', 'api', 'db']);
		expect(doc.edges).toHaveLength(2);
		expect(doc.boundaries![0]).toMatchObject({ id: 'vpc', label: 'Production VPC' });
		expect(doc.nodes![1].links).toEqual([{ label: 'Runbook', url: 'https://example.com/runbook' }]);
	});
});
