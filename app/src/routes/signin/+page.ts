import { signInProviders } from '#lib/signin.ts';
import type { PageLoad } from './$types';

/** The sign-in page: the providers that are on, and why the last sign-in didn't work, if it didn't. */
export const load: PageLoad = async ({ fetch, url }) => ({
	providers: await signInProviders(fetch),
	error: url.searchParams.get('error'),
	signedOut: url.searchParams.has('signed-out'),
	returnTo: url.searchParams.get('return') ?? '/app/',
});
