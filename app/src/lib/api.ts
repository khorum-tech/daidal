import type { AccessToken, CustomType, Diagram, ListedDiagram, Me, SkopeDoc, Snapshot, Workspace } from './types';

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
	const send = <T>(path: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown) =>
		call<T>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const q = encodeURIComponent;
	return {
		me: () => get<Me>('/api/me'),
		/** Saves the signed-in person's name and title. */
		updateMe: (profile: { name: string; title: string }) => send<Me>('/api/me', 'PUT', profile),
		/** Replaces the signed-in person's settings (all of them: read, change and send back the whole object). */
		saveSettings: (settings: Record<string, unknown>) => send<Me>('/api/me', 'PUT', { settings }),
		workspaces: () => get<Workspace[]>('/api/workspaces'),
		/** A workspace's diagrams, newest first, as cards; [search] keeps those whose name or a node's name has it. */
		diagrams: (workspace: string, page: { search?: string; limit?: number; offset?: number } = {}) => {
			const params = new URLSearchParams({ workspace });
			if (page.search?.trim()) params.set('q', page.search.trim());
			if (page.limit !== undefined) params.set('limit', String(page.limit));
			if (page.offset) params.set('offset', String(page.offset));
			return get<ListedDiagram[]>(`/api/diagrams?${params}`);
		},
		diagram: (id: string) => get<Diagram>(`/api/diagrams/${q(id)}`),
		snapshots: (id: string) => get<Snapshot[]>(`/api/diagrams/${q(id)}/snapshots`),
		/** Save as the owner. [rev] is the revision the change was made against; a stale one gets a 409. */
		save: (
			id: string,
			change: { rev: number; doc: SkopeDoc; name?: string; syncedSnapshotId?: string | null; decided?: Record<string, string>; paused?: boolean; leadId?: null }
		) => send<Diagram>(`/api/diagrams/${q(id)}`, 'PUT', change),
		/**
		 * A new diagram in [workspace]: from a document, or as a copy of the diagram [from] (its latest snapshot), which
		 * with [follow] tracks that diagram's snapshots.
		 */
		createDiagram: (body: { workspace: string; name?: string; doc?: SkopeDoc; from?: string; follow?: boolean }) => send<Diagram>('/api/diagrams', 'POST', body),
		/** Moves the diagram, with its history, into another workspace of the owner's. */
		moveDiagram: (id: string, workspace: string) => send<Diagram>(`/api/diagrams/${q(id)}`, 'PATCH', { workspace }),
		/** Deletes the diagram and its history, as its owner. Its followers keep their copies. */
		deleteDiagram: (id: string) => call<void>(`/api/diagrams/${q(id)}`, { method: 'DELETE' }),
		createWorkspace: (name: string) => send<Workspace>('/api/workspaces', 'POST', { name }),
		/** Renames a workspace, as its owner. */
		renameWorkspace: (id: string, name: string) => send<{ id: string; name: string }>(`/api/workspaces/${q(id)}`, 'PATCH', { name }),
		/** Deletes a workspace with its diagrams and their history, as its owner. The personal one stays. */
		deleteWorkspace: (id: string) => call<void>(`/api/workspaces/${q(id)}`, { method: 'DELETE' }),
		/** Adds someone by email (they need not have signed in yet), as the owner. */
		addMember: (id: string, email: string) => send<{ email: string }>(`/api/workspaces/${q(id)}/members`, 'POST', { email }),
		removeMember: (id: string, email: string) => call<void>(`/api/workspaces/${q(id)}/members/${q(email)}`, { method: 'DELETE' }),
		/** Adds a type to a workspace, or changes the one stored under [key] (the slug of its name); any member can. */
		putType: (id: string, key: string, type: CustomType) => send<CustomType>(`/api/workspaces/${q(id)}/types/${q(key)}`, 'PUT', type),
		removeType: (id: string, key: string) => call<void>(`/api/workspaces/${q(id)}/types/${q(key)}`, { method: 'DELETE' }),
		/** Your access tokens (never their secrets). */
		tokens: () => get<AccessToken[]>('/api/me/tokens'),
		/** A new access token; its secret comes back this once. */
		createToken: (body: { name: string; scope: AccessToken['scope']; workspaces?: string[] }) => send<AccessToken & { token: string }>('/api/me/tokens', 'POST', body),
		revokeToken: (id: string) => call<void>(`/api/me/tokens/${q(id)}`, { method: 'DELETE' }),
		/** A workspace as a skope-backup file: its diagrams, their history and who follows whom (not its members). */
		exportWorkspace: (id: string) => get<Record<string, unknown>>(`/api/workspaces/${q(id)}/export`),
		/** Imports a skope-backup file: each workspace in it becomes a new one of yours (a personal one fills yours). */
		importBackup: (backup: unknown) => send<{ workspaces: ImportedWorkspace[] }>('/api/workspaces/import', 'POST', backup),
		/** Records [doc] as a snapshot of the diagram, as its owner. */
		createSnapshot: (id: string, body: { label: string; doc: SkopeDoc }) => send<Snapshot>(`/api/diagrams/${q(id)}/snapshots`, 'POST', body)
	};
}

export type Api = ReturnType<typeof createApi>;

/** What an import made of each workspace in the file. */
export interface ImportedWorkspace {
	id: string;
	name: string;
	personal: boolean;
	diagrams: number;
	snapshots: number;
}
