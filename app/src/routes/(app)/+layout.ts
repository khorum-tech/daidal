import { createApi } from '#lib/api.ts';
import { fetchBuild } from '#lib/build.ts';
import type { LayoutLoad } from './$types';

// Everything here is for someone signed in; the sign-in page (routes/signin) sits outside this group.
export const load: LayoutLoad = async ({ fetch }) => {
	const api = createApi(fetch);
	// The build (/version.json) never holds the page up or breaks it: without one it is null.
	const [me, workspaces, build] = await Promise.all([api.me(), api.workspaces(), fetchBuild(fetch)]);
	return { me, workspaces, build };
};
