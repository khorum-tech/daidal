import { createApi } from '#lib/api.ts';
import type { PageLoad } from './$types';

/** The diagrams of the chosen workspace (?ws=, else the personal one), with their documents for the thumbnails. */
export const load: PageLoad = async ({ fetch, parent, url }) => {
	const { workspaces } = await parent();
	const api = createApi(fetch);
	const wanted = url.searchParams.get('ws');
	const workspace = workspaces.find(w => w.id === wanted) ?? workspaces.find(w => w.personal) ?? workspaces[0];
	const summaries = workspace ? await api.diagrams(workspace.id) : [];
	const diagrams = await Promise.all(summaries.map(d => api.diagram(d.id)));
	// A lead can sit in another workspace; one the caller can't see any more has no name to show.
	const leadIds = [...new Set(diagrams.map(d => d.leadId).filter((id): id is string => !!id))];
	const leads = await Promise.all(leadIds.map(id => api.diagram(id).then(d => [id, d.name] as const, () => [id, null] as const)));
	return { workspace, diagrams, leadNames: Object.fromEntries(leads) };
};
