/**
 * What build of Daidal this is: the site's /version.json, written at build time by scripts/build-info.mjs. A build of
 * main is the release (`0.4.0+1a2b3c4`); any other branch is a snapshot named after it
 * (`0.4.0-SNAPSHOT+fix-card-text.1a2b3c4`). The account menu shows it, and on stage a badge in the header says which
 * branch is live.
 */
export interface BuildInfo {
	name: string;
	/** The full version: the release, `-SNAPSHOT` off main, then the branch and commit as build metadata. */
	version: string;
	/** package.json's version. */
	release: string;
	snapshot: boolean;
	/** Where it was built for: `prod`, `stage`, or `local` (a dev or test build). */
	channel: 'prod' | 'stage' | 'local';
	branch: string;
	commit: string;
	shortCommit: string;
	/** The pull request stage deployed it from, if any. */
	pr: number | null;
	builtAt: string;
}

/** This site's build, or null when there is none to read (`vite dev` has no version.json). Never throws. */
export async function fetchBuild(fetchFn: typeof fetch): Promise<BuildInfo | null> {
	try {
		const res = await fetchFn('/version.json', { headers: { accept: 'application/json' }, cache: 'no-store' });
		if (!res.ok) return null;
		const data = (await res.json()) as Partial<BuildInfo>;
		return typeof data?.version === 'string' ? (data as BuildInfo) : null;
	} catch {
		return null;
	}
}

/** How a person reads it: `0.4.0 · 1a2b3c4` for a release, `0.4.0-SNAPSHOT · fix/card-text · 1a2b3c4` off main. */
export function buildLabel(build: BuildInfo): string {
	const version = `${build.release}${build.snapshot ? '-SNAPSHOT' : ''}`;
	return [version, build.snapshot ? build.branch : '', build.shortCommit].filter(Boolean).join(' · ');
}

/** One line for a tooltip: the version, its PR, and when it was built. */
export function buildTitle(build: BuildInfo): string {
	const when = new Date(build.builtAt);
	const built = Number.isNaN(when.getTime()) ? '' : `built ${when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
	return [`Daidal ${build.version}`, build.pr ? `PR #${build.pr}` : '', built].filter(Boolean).join(' · ');
}
