import { describe, expect, it } from 'vitest';
import { DAIDAL_SITE, placeholders, siteUrls } from './site';

describe('the docs’ addresses', () => {
	it('are Daidal’s own when nothing is set', () => {
		expect(siteUrls({})).toEqual(DAIDAL_SITE);
		expect(siteUrls({ DAIDAL_URL: '  ', DAIDAL_LOCAL_URL: '', DAIDAL_REPO_URL: '' })).toEqual(DAIDAL_SITE);
	});

	it('take what the environment sets, without a trailing slash', () => {
		expect(
			siteUrls({
				DAIDAL_URL: 'https://diagrams.example.com/',
				DAIDAL_STAGE_URL: ' https://diagrams-stage.example.com ',
				DAIDAL_LOCAL_URL: 'http://localhost:9000',
				DAIDAL_REPO_URL: 'https://git.example.com/platform/daidal',
				OTHER: 'ignored'
			})
		).toEqual({
			url: 'https://diagrams.example.com',
			stageUrl: 'https://diagrams-stage.example.com',
			localUrl: 'http://localhost:9000',
			repoUrl: 'https://git.example.com/platform/daidal'
		});
	});

	it('leave stage out when it’s set empty, but keep it when it’s unset', () => {
		expect(siteUrls({ DAIDAL_STAGE_URL: '' }).stageUrl).toBe('');
		expect(siteUrls({ DAIDAL_URL: 'https://d.example.com' }).stageUrl).toBe(DAIDAL_SITE.stageUrl);
	});

	it('refuse anything but a plain http(s) address, naming the variable', () => {
		for (const bad of ['daidal.example.com', 'javascript:alert(1)', 'ftp://x.example.com', 'https://x.example.com/?a=1', 'https://x.example.com/#top', 'https://me:pw@x.example.com']) {
			expect(() => siteUrls({ DAIDAL_URL: bad }), bad).toThrow(/^DAIDAL_URL must be an http or https address/);
		}
		expect(() => siteUrls({ DAIDAL_STAGE_URL: 'stage' })).toThrow(/^DAIDAL_STAGE_URL /);
	});

	it('name a placeholder for each', () => {
		expect(placeholders(DAIDAL_SITE)).toEqual({
			DAIDAL_URL: 'https://daidal.khorum.org',
			DAIDAL_STAGE_URL: 'https://daidal-stage.khorum.org',
			DAIDAL_LOCAL_URL: 'http://localhost:8787',
			DAIDAL_REPO_URL: 'https://github.com/khorum-tech/daidal'
		});
	});
});
