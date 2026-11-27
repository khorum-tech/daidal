/**
 * Signing in and out (the Worker's `/auth/` routes, worker/src/signin). Which providers are on is the instance's
 * own setting: Cloudflare Access alone on the hosted site, or the sign-in page's providers on a self-hosted one.
 */

export interface SignInProvider {
	id: string;
	name: string;
	icon: string | null;
	/** `redirect`: signed in from Daidal's sign-in page. `header`: something in front of Daidal signs people in. */
	kind: 'redirect' | 'header';
}

type Fetch = typeof fetch;

/** The providers that are on; none when the Worker can't say. */
export async function signInProviders(fetchFn: Fetch = fetch): Promise<SignInProvider[]> {
	try {
		const res = await fetchFn('/auth/providers', { headers: { accept: 'application/json' } });
		if (!res.ok) return [];
		return ((await res.json()) as { providers: SignInProvider[] }).providers;
	} catch {
		return [];
	}
}

/** Where a provider's button goes: it leaves for the provider and comes back to [returnTo]. */
export const startHref = (id: string, returnTo: string) => `/auth/start/${encodeURIComponent(id)}?return=${encodeURIComponent(returnTo)}`;

/** The sign-in page, coming back to [returnTo] after. */
export const signInHref = (returnTo: string) => `/app/signin?return=${encodeURIComponent(returnTo)}`;

/** What a sign-in page `?error=` means, in words. */
export const SIGN_IN_ERRORS: Record<string, string> = {
	denied: "That account isn't allowed to sign in here. Ask whoever runs this Daidal to let you in.",
	unverified: "The provider hasn't confirmed that account's email, so it can't sign you in. Confirm it there and try again.",
	expired: 'That sign-in took too long or was started somewhere else. Try again.',
	unknown: "That way of signing in isn't on here.",
	failed: "Signing in didn't work. Try again, or pick another way.",
};

/**
 * The session has lapsed: go to the sign-in page if this instance has one, else reload so the sign-in in front of
 * Daidal (Cloudflare Access) asks again.
 */
export async function signInAgain(fetchFn: Fetch = fetch, here = location.pathname + location.search): Promise<void> {
	const providers = await signInProviders(fetchFn);
	if (providers.some(p => p.kind === 'redirect')) location.assign(signInHref(here));
	else location.reload();
}

/** Ends this browser's sign-in and goes where the Worker says: the sign-in page, or Access's own logout. */
export async function signOut(fetchFn: Fetch = fetch): Promise<void> {
	let to = '/app/signin?signed-out=1';
	try {
		const res = await fetchFn('/auth/signout', { method: 'POST', headers: { accept: 'application/json' } });
		if (res.ok) to = ((await res.json()) as { redirect?: string }).redirect ?? to;
	} catch {
		// Offline: the sign-in page still shows; the session ends when it lapses or on the next sign out.
	}
	location.assign(to);
}
