import { describe, expect, it } from 'vitest';
import { buildLabel, buildTitle, fetchBuild, type BuildInfo } from './build';

const BUILD: BuildInfo = {
	name: 'daidal',
	version: '0.0.0-SNAPSHOT+feat-version-display.1a2b3c4',
	release: '0.0.0',
	snapshot: true,
	channel: 'stage',
	branch: 'feat/version-display',
	commit: '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
	shortCommit: '1a2b3c4',
	pr: 87,
	builtAt: '2026-11-22T05:00:00.000Z'
};

const answering = (res: Response | Error) => (async () => {
	if (res instanceof Error) throw res;
	return res;
}) as unknown as typeof fetch;

describe('fetchBuild', () => {
	it('reads the site’s version.json', async () => {
		expect(await fetchBuild(answering(Response.json(BUILD)))).toEqual(BUILD);
	});

	it('is null when there is no build to read, and never throws', async () => {
		expect(await fetchBuild(answering(new Response('missing', { status: 404 })))).toBeNull();
		expect(await fetchBuild(answering(new Response('<html>', { status: 200 })))).toBeNull();
		expect(await fetchBuild(answering(Response.json({ nope: true })))).toBeNull();
		expect(await fetchBuild(answering(new Error('offline')))).toBeNull();
	});
});

describe('buildTitle', () => {
	it('names the version, the PR and when it was built', () => {
		const title = buildTitle(BUILD);
		expect(title.startsWith('Daidal 0.0.0-SNAPSHOT+feat-version-display.1a2b3c4 · PR #87 · built ')).toBe(true);
	});

	it('leaves out what it doesn’t have', () => {
		expect(buildTitle({ ...BUILD, pr: null, builtAt: 'never' })).toBe('Daidal 0.0.0-SNAPSHOT+feat-version-display.1a2b3c4');
	});
});

describe('buildLabel', () => {
	it('reads a snapshot by its branch and commit', () => {
		expect(buildLabel(BUILD)).toBe('0.0.0-SNAPSHOT · feat/version-display · 1a2b3c4');
	});

	it('reads a release by its version and commit', () => {
		expect(buildLabel({ ...BUILD, snapshot: false, branch: 'main', channel: 'prod', version: '0.0.0+1a2b3c4' })).toBe('0.0.0 · 1a2b3c4');
		expect(buildLabel({ ...BUILD, snapshot: false, branch: 'main', shortCommit: '' })).toBe('0.0.0');
	});
});
