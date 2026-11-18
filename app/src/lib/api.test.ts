import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';

const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('createApi', () => {
	it('asks for JSON and escapes ids in paths', async () => {
		const fetchFn = respond(200, []);
		await createApi(fetchFn).diagrams('personal:a@example.com');
		expect(fetchFn).toHaveBeenCalledWith('/api/diagrams?workspace=personal%3Aa%40example.com', { headers: { accept: 'application/json' } });
		await createApi(fetchFn).diagrams('w', { search: ' cart ', limit: 60, offset: 120 });
		expect(fetchFn).toHaveBeenLastCalledWith('/api/diagrams?workspace=w&q=cart&limit=60&offset=120', expect.anything());
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

describe('diagrams and snapshots', () => {
	it('creates a diagram, from a document or as a copy', async () => {
		const fetchFn = respond(201, { id: 'n' });
		const api = createApi(fetchFn);
		await api.createDiagram({ workspace: 'w', name: 'New', doc: { version: 1 } });
		expect(fetchFn).toHaveBeenLastCalledWith('/api/diagrams', expect.objectContaining({ method: 'POST', body: JSON.stringify({ workspace: 'w', name: 'New', doc: { version: 1 } }) }));
		await api.createDiagram({ workspace: 'w', from: 'd', follow: true });
		expect(fetchFn).toHaveBeenLastCalledWith('/api/diagrams', expect.objectContaining({ body: JSON.stringify({ workspace: 'w', from: 'd', follow: true }) }));
	});

	it('deletes a diagram, which answers with no body', async () => {
		const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
		await expect(createApi(fetchFn).deleteDiagram('a/b')).resolves.toBeUndefined();
		expect(fetchFn).toHaveBeenCalledWith('/api/diagrams/a%2Fb', expect.objectContaining({ method: 'DELETE' }));
	});

	it('takes a snapshot of a document', async () => {
		const fetchFn = respond(201, { id: 's', label: 'v1' });
		await expect(createApi(fetchFn).createSnapshot('d', { label: 'v1', doc: { version: 1 } })).resolves.toEqual({ id: 's', label: 'v1' });
		expect(fetchFn).toHaveBeenCalledWith('/api/diagrams/d/snapshots', expect.objectContaining({ method: 'POST', body: JSON.stringify({ label: 'v1', doc: { version: 1 } }) }));
	});
});

describe('workspaces', () => {
	it('creates, renames and deletes a workspace', async () => {
		const fetchFn = respond(201, { id: 'w', name: 'Team' });
		const api = createApi(fetchFn);
		await api.createWorkspace('Team');
		expect(fetchFn).toHaveBeenLastCalledWith('/api/workspaces', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Team' }) }));
		await api.renameWorkspace('w/1', 'Crew');
		expect(fetchFn).toHaveBeenLastCalledWith('/api/workspaces/w%2F1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Crew' }) }));
		const none = vi.fn(async () => new Response(null, { status: 204 }));
		await createApi(none).deleteWorkspace('w');
		expect(none).toHaveBeenCalledWith('/api/workspaces/w', expect.objectContaining({ method: 'DELETE' }));
	});

	it('adds and removes members by email', async () => {
		const fetchFn = respond(201, { email: 'b@x.io' });
		await createApi(fetchFn).addMember('w', 'b@x.io');
		expect(fetchFn).toHaveBeenLastCalledWith('/api/workspaces/w/members', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'b@x.io' }) }));
		const none = vi.fn(async () => new Response(null, { status: 204 }));
		await createApi(none).removeMember('w', 'b@x.io');
		expect(none).toHaveBeenCalledWith('/api/workspaces/w/members/b%40x.io', expect.objectContaining({ method: 'DELETE' }));
	});

	it('exports a workspace and imports a backup', async () => {
		const fetchFn = respond(200, { format: 'daidal-backup' });
		await expect(createApi(fetchFn).exportWorkspace('w')).resolves.toEqual({ format: 'daidal-backup' });
		expect(fetchFn).toHaveBeenLastCalledWith('/api/workspaces/w/export', expect.anything());
		const imported = respond(201, { workspaces: [{ id: 'n', name: 'Team' }] });
		await createApi(imported).importBackup({ format: 'daidal-backup' });
		expect(imported).toHaveBeenLastCalledWith('/api/workspaces/import', expect.objectContaining({ method: 'POST', body: JSON.stringify({ format: 'daidal-backup' }) }));
	});
});
