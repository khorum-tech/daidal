import { createApi } from '#lib/api.ts';
import { fetchBuild } from '#lib/build.ts';
import type { LayoutLoad } from './$types';

// A client-only single-page app: the Worker serves index.html for every route under /app.
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ fetch }) => {
	const api = createApi(fetch);
	// The build (/version.json) never holds the page up or breaks it: without one it is null.
	const [me, workspaces, build] = await Promise.all([api.me(), api.workspaces(), fetchBuild(fetch)]);
	return { me, workspaces, build };
};
