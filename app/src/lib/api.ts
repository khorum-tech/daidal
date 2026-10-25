import type { Diagram, DiagramSummary, Me, SkopeDoc, Snapshot, Workspace } from './types';

/** An API answer other than 2xx, with the server's `{ error }` message. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		/** The whole error body; a 409 from a save carries the current diagram as `diagram`. */
		readonly body: Record<string, unknown> = {}
	) {
		super(message);
	}
}

type Fetch = typeof fetch;

/**
 * The Worker's API. Access signs every request, so there is no token to send. A 401 means the Access session has
 * lapsed (or the API can't see the user); reloading sends the browser through Access again.
 */
export function createApi(fetchFn: Fetch, onSignedOut: () => void = () => location.reload()) {
	async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
		const res = await fetchFn(path, { ...init, headers: { accept: 'application/json', ...init.headers } });
		if (res.status === 401) {
			onSignedOut();
			throw new ApiError(401, 'your sign-in has expired');
		}
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
			throw new ApiError(res.status, typeof body.error === 'string' ? body.error : `HTTP ${res.status}`, body);
		}
		// A delete answers 204 with no body.
		return (res.status === 204 ? undefined : await res.json()) as T;
	}
	const get = <T>(path: string) => call<T>(path);
	const send = <T>(path: string, method: 'POST' | 'PUT', body: unknown) =>
		call<T>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const q = encodeURIComponent;
	return {
		me: () => get<Me>('/api/me'),
		workspaces: () => get<Workspace[]>('/api/workspaces'),
		diagrams: (workspace: string) => get<DiagramSummary[]>(`/api/diagrams?workspace=${q(workspace)}`),
		diagram: (id: string) => get<Diagram>(`/api/diagrams/${q(id)}`),
		snapshots: (id: string) => get<Snapshot[]>(`/api/diagrams/${q(id)}/snapshots`),
		/** Save as the owner. [rev] is the revision the change was made against; a stale one gets a 409. */
		save: (id: string, change: { rev: number; doc: SkopeDoc; name?: string }) => send<Diagram>(`/api/diagrams/${q(id)}`, 'PUT', change),
		/**
		 * A new diagram in [workspace]: from a document, or as a copy of the diagram [from] (its latest snapshot), which
		 * with [follow] tracks that diagram's snapshots.
		 */
		createDiagram: (body: { workspace: string; name?: string; doc?: SkopeDoc; from?: string; follow?: boolean }) => send<Diagram>('/api/diagrams', 'POST', body),
		/** Deletes the diagram and its history, as its owner. Its followers keep their copies. */
		deleteDiagram: (id: string) => call<void>(`/api/diagrams/${q(id)}`, { method: 'DELETE' }),
		/** Records [doc] as a snapshot of the diagram, as its owner. */
		createSnapshot: (id: string, body: { label: string; doc: SkopeDoc }) => send<Snapshot>(`/api/diagrams/${q(id)}/snapshots`, 'POST', body)
	};
}

export type Api = ReturnType<typeof createApi>;
