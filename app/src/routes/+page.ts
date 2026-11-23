import { createApi } from '#lib/api.ts';
import type { PageLoad } from './$types';

/** How many cards come at a time; Show more fetches the next lot. */
const PAGE = 60;

/**
 * The first cards of the chosen workspace (?ws=, else the personal one), searched by ?q= and kept to one group by ?g=
 * (an empty ?g= for the diagrams in no group). One request: each card comes with what it draws, so no documents load
 * here.
 */
export const load: PageLoad = async ({ fetch, parent, url }) => {
	const { workspaces } = await parent();
	const api = createApi(fetch);
	const wanted = url.searchParams.get('ws');
	const workspace = workspaces.find(w => w.id === wanted) ?? workspaces.find(w => w.personal) ?? workspaces[0];
	const search = url.searchParams.get('q') ?? '';
	const group = url.searchParams.has('g') ? (url.searchParams.get('g') ?? '').trim() : undefined;
	const diagrams = workspace ? await api.diagrams(workspace.id, { search, group, limit: PAGE }) : [];
	return { workspace, search, group, diagrams, pageSize: PAGE };
};
