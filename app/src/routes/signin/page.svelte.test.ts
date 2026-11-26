import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SignIn from './+page.svelte';

type Data = { providers: { id: string; name: string; icon: string | null; kind: 'redirect' | 'header' }[]; error: string | null; signedOut: boolean; returnTo: string };
const data = (over: Partial<Data> = {}): Data => ({ providers: [], error: null, signedOut: false, returnTo: '/app/d/x', ...over });
// The page reads only `data`; the rest of SvelteKit's page props don't matter here.
const show = (d: Data) => render(SignIn, { data: d } as never);

describe('the sign-in page', () => {
	it('offers each sign-in page provider, coming back to where you were', async () => {
		await show(data({ providers: [{ id: 'corp', name: 'Corp SSO', icon: 'key', kind: 'redirect' }, { id: 'github', name: 'GitHub', icon: null, kind: 'redirect' }] }));
		await expect.element(page.getByRole('link', { name: 'Continue with Corp SSO' })).toHaveAttribute('href', '/auth/start/corp?return=%2Fapp%2Fd%2Fx');
		await expect.element(page.getByRole('link', { name: 'Continue with GitHub' })).toBeVisible();
	});

	it('explains why the last sign-in didn\'t work', async () => {
		await show(data({ error: 'denied', providers: [{ id: 'corp', name: 'Corp SSO', icon: 'key', kind: 'redirect' }] }));
		await expect.element(page.getByRole('alert')).toHaveTextContent("isn't allowed to sign in here");
	});

	it('says you are signed out, and points to the sign-in in front when there is no page provider', async () => {
		await show(data({ signedOut: true, providers: [{ id: 'access', name: 'Cloudflare Access', icon: 'shieldCheck', kind: 'header' }] }));
		await expect.element(page.getByRole('status')).toHaveTextContent("You're signed out.");
		await expect.element(page.getByText('signs you in through Cloudflare Access')).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/app/d/x');
	});

	it('says when no way of signing in is on', async () => {
		await show(data());
		await expect.element(page.getByText('No way of signing in is turned on here yet')).toBeVisible();
	});
});
