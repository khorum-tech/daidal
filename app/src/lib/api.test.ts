import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';

const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('createApi', () => {
	it('asks for JSON and escapes ids in paths', async () => {
		const fetchFn = respond(200, []);
		await createApi(fetchFn).diagrams('personal:a@example.com');
		expect(fetchFn).toHaveBeenCalledWith('/api/diagrams?workspace=personal%3Aa%40example.com', { headers: { accept: 'application/json' } });
		await createApi(fetchFn).snapshots('a/b');
		expect(fetchFn).toHaveBeenLastCalledWith('/api/diagrams/a%2Fb/snapshots', expect.anything());
	});

	it("turns an error answer into an ApiError with the server's message", async () => {
		const err = await createApi(respond(404, { error: 'not found' }))
			.diagram('x')
			.catch(e => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toMatchObject({ status: 404, message: 'not found' });
	});

	it('sends the browser back through sign-in on a 401', async () => {
		const signedOut = vi.fn();
		await expect(createApi(respond(401, { error: 'not signed in' }), signedOut).me()).rejects.toMatchObject({ status: 401 });
		expect(signedOut).toHaveBeenCalledOnce();
	});
});
