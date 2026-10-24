import { createApi } from '#lib/api.ts';
import type { LayoutLoad } from './$types';

// A client-only single-page app: the Worker serves index.html for every route under /app.
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ fetch }) => {
	const api = createApi(fetch);
	const [me, workspaces] = await Promise.all([api.me(), api.workspaces()]);
	return { me, workspaces };
};
