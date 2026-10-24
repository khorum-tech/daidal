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

describe('saving', () => {
	it('puts the change as JSON and returns the saved diagram', async () => {
		const fetchFn = respond(200, { id: 'd', rev: 3 });
		const saved = await createApi(fetchFn).save('d', { rev: 2, doc: { version: 1 } });
		expect(saved).toEqual({ id: 'd', rev: 3 });
		expect(fetchFn).toHaveBeenCalledWith('/api/diagrams/d', {
			method: 'PUT',
			headers: { accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ rev: 2, doc: { version: 1 } })
		});
	});

	it('keeps the current diagram a 409 comes with', async () => {
		const err = await createApi(respond(409, { error: 'the diagram changed since you loaded it', diagram: { rev: 5 } }))
			.save('d', { rev: 2, doc: { version: 1 } })
			.catch(e => e);
		expect(err).toMatchObject({ status: 409, body: { diagram: { rev: 5 } } });
	});
});
