import { neighbours, pageOf } from '#lib/docs/docs.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const slug = params.page ?? null;
	return { slug, page: slug ? (pageOf(slug) ?? null) : null, ...(slug ? neighbours(slug) : {}) };
};
