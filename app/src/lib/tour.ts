// The getting-started tour: steps over the real editor, on a practice diagram made for it. Each step points at a
// control (the first of its `targets` on screen) and, when it has a `done` check, moves on by itself once the
// person has really done it; otherwise Next does. Progress is kept in the account (`/api/me` settings.tutorial), so
// it survives a reload and follows you to another device.
import type { createApi } from './api';
import type { Me, SkopeDoc } from './types';

export interface TourStep {
	id: string;
	title: string;
	body: string;
	/** On a phone, where the controls differ. */
	phoneBody?: string;
	/** CSS selectors for what to point at; the first one on screen wins, and none on screen just shows the card. */
	targets: string[];
	/** Whether the step is done, from what the diagram (and the editor) is now and was when the step began. */
	done?: (now: TourCounts, start: TourCounts) => boolean;
}

/** What the steps watch. */
export interface TourCounts {
	nodes: number;
	edges: number;
	boxes: number;
	views: number;
	/** Nodes with at least one tag. */
	tagged: number;
	/** Nodes still called "New …", as a node added from the type picker is. */
	unnamed: number;
	presenting: boolean;
}

export function tourCounts(doc: SkopeDoc, presenting = false): TourCounts {
	const nodes = doc.nodes ?? [];
	return {
		nodes: nodes.length,
		edges: (doc.edges ?? []).length,
		boxes: (doc.boundaries ?? []).length,
		views: (doc.views ?? []).length,
		tagged: nodes.filter(n => n.tags?.length).length,
		unnamed: nodes.filter(n => (n.name ?? '').startsWith('New ')).length,
		presenting
	};
}

export const TOUR: TourStep[] = [
	{
		id: 'welcome',
		title: 'Welcome to Skope',
		body: 'This practice diagram is yours to play with. A few steps show the basics, on the real controls. You can end the tour any time and pick it up again from the menu under your name.',
		targets: []
	},
	{
		id: 'add',
		title: 'Add a node',
		body: 'Press **+ Add** and pick a type, say **Service**. It lands in free space and opens its details.',
		phoneBody: 'Tap **+ Add** and pick a type, say **Service**. It starts in Move: drag it where you like, then tap **Done**.',
		targets: ['[data-tour="add"]'],
		done: (now, start) => now.nodes > start.nodes
	},
	{
		id: 'name',
		title: 'Name it',
		body: 'Type a name for it in its details, like **Checkout API**.',
		phoneBody: 'Tap the node, then **Edit**, and type a name for it, like **Checkout API**.',
		targets: ['#node-name', '[data-tour="node-edit"]'],
		done: (now, start) => now.unnamed < start.unnamed || (start.unnamed === 0 && now.unnamed === 0)
	},
	{
		id: 'connect',
		title: 'Connect two nodes',
		body: 'Drag the **+** port on a selected node onto another one. Or press **Connect**, then click one node and the other.',
		phoneBody: 'Tap a node, then **Connect**, then tap the other node.',
		targets: ['[data-tour="connect"]'],
		done: (now, start) => now.edges > start.edges
	},
	{
		id: 'container',
		title: 'Group them',
		body: 'Add a **container** (the box button, or **+ Add** → Container) and drag its border around your nodes. Whatever sits inside moves with it.',
		phoneBody: 'Tap **+ Add** → **Container**. Select it, tap **Move** or **Resize**, and drag.',
		targets: ['[data-tour="container"]', '[data-tour="add"]'],
		done: (now, start) => now.boxes > start.boxes
	},
	{
		id: 'tag',
		title: 'Tag something',
		body: 'Select a node and give it a tag in its details: **+ Tag** → **New tag…**, then a name like **Public**. Tags colour-code nodes and let you show one slice at a time.',
		phoneBody: 'Tap a node, **Edit**, then **+ Tag** → **New tag…** and a name like **Public**.',
		targets: ['[data-tour="tags"]', '[data-tour="node-edit"]'],
		done: (now, start) => now.tagged > start.tagged
	},
	{
		id: 'view',
		title: 'Save a view',
		body: 'Switch a tag off in the left panel and see the nodes fade. Then **+ Save the tags on now as a view**, so you can come back to this slice in one click.',
		phoneBody: 'Tap **View** in the bottom bar, switch a tag off, then **+ Save the tags on now as a view**.',
		targets: ['[data-tour="save-view"]', '[data-tour="views"]'],
		done: (now, start) => now.views > start.views
	},
	{
		id: 'undo',
		title: 'Undo anything',
		body: 'Every change saves as you go, and every change can be undone: this button, or ⌘Z. **History** keeps snapshots you take, to look back at.',
		targets: ['[data-tour="undo"]']
	},
	{
		id: 'present',
		title: 'Present it',
		body: 'Press **Present** to show the diagram full screen, read-only. Hover a node for its notes; Escape comes back.',
		phoneBody: 'Open the diagram’s name at the top, then **Present**. Tap a node for its notes; the × comes back.',
		targets: ['[data-tour="present"]'],
		done: now => now.presenting
	},
	{
		id: 'done',
		title: 'That’s the basics',
		body: 'Keep this diagram or delete it from its sheet. The **Docs** (in the menu under your name) cover the rest: the config format, workspaces and sharing, and connecting an AI to edit your diagrams.',
		targets: []
	}
];

/** Where someone is in the tour, as kept in their settings. */
export interface TourState {
	/** The practice diagram. */
	diagram?: string;
	step: number;
	done?: boolean;
	/** They said no to the offer on the home screen. */
	dismissed?: boolean;
}

export function tourOf(me: Me): TourState | null {
	const t = me.settings?.tutorial;
	if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
	const s = t as Record<string, unknown>;
	return {
		...(typeof s.diagram === 'string' ? { diagram: s.diagram } : {}),
		step: typeof s.step === 'number' && s.step >= 0 ? Math.min(Math.floor(s.step), TOUR.length - 1) : 0,
		...(s.done === true ? { done: true } : {}),
		...(s.dismissed === true ? { dismissed: true } : {})
	};
}

/** Whether to offer the tour on the home screen: never started, never turned down. */
export const offerTour = (me: Me) => tourOf(me) === null;

/** The practice diagram the tour runs on: one node to start from. */
export function practiceDoc(): SkopeDoc {
	return {
		version: 1,
		diagram: { name: 'Getting started', kind: 'Freeform' },
		nodes: [{ id: 'storefront', name: 'Storefront', type: 'web-app', subtitle: 'Where customers shop', layout: { x: 120, y: 160 } }]
	};
}

/** [settings] with the tour's state in place of what was there: the PUT replaces all of settings, so the rest rides along. */
export const withTour = (settings: Record<string, unknown>, state: TourState): Record<string, unknown> => ({ ...settings, tutorial: state });

type Api = ReturnType<typeof createApi>;

/** Keeps [state] as the tour's place, reading the latest settings first so nothing else in them is lost. */
export async function saveTour(api: Api, state: TourState): Promise<void> {
	const me = await api.me();
	await api.saveSettings(withTour(me.settings ?? {}, state));
}

/** Starts the tour: a practice diagram in the personal workspace, and the tour at its first step on it. Gives its id. */
export async function startTour(api: Api, personalWorkspace: string): Promise<string> {
	const made = await api.createDiagram({ workspace: personalWorkspace, name: 'Getting started', doc: practiceDoc() });
	await saveTour(api, { diagram: made.id, step: 0 });
	return made.id;
}
