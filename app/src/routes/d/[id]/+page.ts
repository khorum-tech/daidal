import { error } from '@sveltejs/kit';
import { ApiError, createApi } from '#lib/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const api = createApi(fetch);
	try {
		const [diagram, snapshots] = await Promise.all([api.diagram(params.id), api.snapshots(params.id)]);
		// The lead may be gone or out of reach; the page then says so instead of failing.
		const lead = diagram.leadId
			? await Promise.all([api.diagram(diagram.leadId), api.snapshots(diagram.leadId)]).then(
					([d, s]) => ({ name: d.name, snapshots: s }),
					() => null
				)
			: null;
		return { diagram, snapshots, lead };
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
};
