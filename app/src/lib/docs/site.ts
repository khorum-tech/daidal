// The addresses the in-app docs give for "your" Daidal, so a copy run for another organisation points its docs at
// itself. They come from the environment at build time (a .env at the repository root, or the build's own
// environment), read in vite.config.ts; anything not set keeps Daidal's own.
//
//   DAIDAL_URL        the Daidal people use                    https://daidal.khorum.org
//   DAIDAL_STAGE_URL  its stage, if there is one; set it empty to leave stage out of the docs
//   DAIDAL_LOCAL_URL  wrangler dev on your computer (the app's dev server sends /api there too)
//   DAIDAL_REPO_URL   the repository the docs link to
//
// This file is imported by vite.config.ts as well as the app, so it imports nothing.

export interface SiteUrls {
	url: string;
	/** Empty when there's no stage. */
	stageUrl: string;
	localUrl: string;
	repoUrl: string;
}

export const DAIDAL_SITE: SiteUrls = {
	url: 'https://daidal.khorum.org',
	stageUrl: 'https://daidal-stage.khorum.org',
	localUrl: 'http://localhost:8787',
	repoUrl: 'https://github.com/khorum-tech/daidal'
};

const NAMES: Record<keyof SiteUrls, string> = {
	url: 'DAIDAL_URL',
	stageUrl: 'DAIDAL_STAGE_URL',
	localUrl: 'DAIDAL_LOCAL_URL',
	repoUrl: 'DAIDAL_REPO_URL'
};

/** [value] as a plain http(s) address with no trailing slash; throws, naming [name], for anything else. */
function address(name: string, value: string): string {
	const parsed = URL.canParse(value) ? new URL(value) : undefined;
	const plain = parsed && /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
	if (!parsed || !plain) {
		throw new Error(`${name} must be an http or https address with no query, like https://daidal.example.com (got "${value}")`);
	}
	let href = parsed.href;
	while (href.endsWith('/')) href = href.slice(0, -1);
	return href;
}

/**
 * The docs' addresses from [env] (variables named as above). Unset or blank keeps Daidal's own, except
 * DAIDAL_STAGE_URL, which blank turns off.
 */
export function siteUrls(env: Record<string, string | undefined>): SiteUrls {
	const out = { ...DAIDAL_SITE };
	for (const key of Object.keys(NAMES) as (keyof SiteUrls)[]) {
		const raw = env[NAMES[key]];
		if (raw === undefined) continue;
		const value = raw.trim();
		if (value) out[key] = address(NAMES[key], value);
		else if (key === 'stageUrl') out[key] = '';
	}
	return out;
}

/** The placeholder a docs page writes for each address: {{DAIDAL_URL}} and so on. */
export const placeholders = (site: SiteUrls): Record<string, string> =>
	Object.fromEntries((Object.keys(NAMES) as (keyof SiteUrls)[]).map(k => [NAMES[k], site[k]]));
