import type { Diagram, DiagramSummary, Me, Snapshot, Workspace } from './types';

/** An API answer other than 2xx, with the server's `{ error }` message. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

type Fetch = typeof fetch;

/**
 * The Worker's API, read side. Access signs every request, so there is no token to send. A 401 means the Access
 * session has lapsed (or the API can't see the user); reloading sends the browser through Access again.
 */
export function createApi(fetchFn: Fetch, onSignedOut: () => void = () => location.reload()) {
	async function get<T>(path: string): Promise<T> {
		const res = await fetchFn(path, { headers: { accept: 'application/json' } });
		if (res.status === 401) {
			onSignedOut();
			throw new ApiError(401, 'your sign-in has expired');
		}
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
		}
		return (await res.json()) as T;
	}
	const q = encodeURIComponent;
	return {
		me: () => get<Me>('/api/me'),
		workspaces: () => get<Workspace[]>('/api/workspaces'),
		diagrams: (workspace: string) => get<DiagramSummary[]>(`/api/diagrams?workspace=${q(workspace)}`),
		diagram: (id: string) => get<Diagram>(`/api/diagrams/${q(id)}`),
		snapshots: (id: string) => get<Snapshot[]>(`/api/diagrams/${q(id)}/snapshots`)
	};
}

export type Api = ReturnType<typeof createApi>;
