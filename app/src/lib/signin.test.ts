import { afterEach, describe, expect, it, vi } from 'vitest';
import { signInAgain, signInHref, signInProviders, signOut, startHref } from './signin';

const json = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const PAGE = { id: 'corp', name: 'Corp SSO', icon: 'key', kind: 'redirect' };
const ACCESS = { id: 'access', name: 'Cloudflare Access', icon: 'shieldCheck', kind: 'header' };

function stubLocation() {
	const loc = { assign: vi.fn(), reload: vi.fn(), pathname: '/app/d/x', search: '?view=Full' };
	vi.stubGlobal('location', loc);
	return loc;
}
afterEach(() => vi.unstubAllGlobals());

describe('sign-in', () => {
	it('lists the providers that are on, and none when the Worker can\'t say', async () => {
		expect(await signInProviders(json({ providers: [PAGE, ACCESS] }))).toEqual([PAGE, ACCESS]);
		expect(await signInProviders(json({ error: 'x' }, 500))).toEqual([]);
		expect(await signInProviders(vi.fn(async () => Promise.reject(new Error('offline'))))).toEqual([]);
	});

	it('builds the links to start a sign-in and to the sign-in page, escaped', () => {
		expect(startHref('corp', '/app/d/a b?view=1')).toBe('/auth/start/corp?return=%2Fapp%2Fd%2Fa%20b%3Fview%3D1');
		expect(signInHref('/app/')).toBe('/app/signin?return=%2Fapp%2F');
	});

	it('sends a lapsed session to the sign-in page, or reloads through Access when there is none', async () => {
		const loc = stubLocation();
		await signInAgain(json({ providers: [PAGE, ACCESS] }));
		expect(loc.assign).toHaveBeenCalledWith('/app/signin?return=%2Fapp%2Fd%2Fx%3Fview%3DFull');
		await signInAgain(json({ providers: [ACCESS] }));
		expect(loc.reload).toHaveBeenCalledOnce();
	});

	it('signs out and goes where the Worker says, or to the sign-in page', async () => {
		const loc = stubLocation();
		const fetchFn = json({ redirect: '/cdn-cgi/access/logout' });
		await signOut(fetchFn);
		expect(fetchFn).toHaveBeenCalledWith('/auth/signout', expect.objectContaining({ method: 'POST' }));
		expect(loc.assign).toHaveBeenLastCalledWith('/cdn-cgi/access/logout');
		await signOut(vi.fn(async () => Promise.reject(new Error('offline'))));
		expect(loc.assign).toHaveBeenLastCalledWith('/app/signin?signed-out=1');
	});
});
