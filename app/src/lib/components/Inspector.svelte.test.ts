import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Inspector from './Inspector.svelte';
import type { NodeChange } from '@khorum/daidal-core/edit';
import { toScene } from '@khorum/daidal-core/model';
import { SAMPLE } from '@khorum/daidal-core/fixtures';

const scene = toScene(SAMPLE);
const tags = Object.fromEntries(scene.tags.map(t => [t.key, t]));
const node = (id: string) => scene.nodes.find(n => n.id === id)!;

/** Render an editable inspector for [id], collecting what it reports. */
async function editing(id: string) {
	const changes: { change: NodeChange; label: string; group?: string }[] = [];
	const calls: string[] = [];
	await render(Inspector, {
		node: node(id),
		tags,
		editable: true,
		onchange: (change, label, group) => changes.push({ change, label, group }),
		onfieldend: () => calls.push('end'),
		ondelete: () => calls.push('delete'),
		onduplicate: () => calls.push('duplicate')
	});
	return { changes, calls };
}

describe('the inspector', () => {
	it('shows a node read-only unless editable', async () => {
		await render(Inspector, { node: node('gw'), tags });
		await expect.element(page.getByRole('heading', { name: 'Gateway' })).toBeVisible();
		await expect.element(page.getByText('The one way in.')).toBeVisible();
		expect(page.getByLabelText('Name').elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Delete node' }).elements()).toHaveLength(0);
	});

	it('reports typing as one group per field, ended when the field is left', async () => {
		const { changes, calls } = await editing('gw');
		await expect.element(page.getByLabelText('Name')).toHaveValue('Gateway');
		await expect.element(page.getByLabelText('Notes')).toHaveValue('The one way in.');
		await page.getByLabelText('Subtitle').fill('Envoy');
		await page.getByLabelText('Name').click();
		expect(changes).toEqual([{ change: { subtitle: 'Envoy' }, label: 'Edit subtitle', group: 'gw:subtitle' }]);
		expect(calls).toEqual(['end']);
	});

	it('gives a name left blank its type', async () => {
		const { changes } = await editing('gw');
		await page.getByLabelText('Name').fill('');
		await page.getByLabelText('Notes').click();
		expect(changes.at(-1)).toEqual({ change: { name: 'API Gateway' }, label: 'Rename node', group: 'gw:name' });
	});

	it('changes the type, flags, tags and links with a tap', async () => {
		const { changes } = await editing('shop');
		await page.getByRole('button', { name: 'Web App', expanded: false }).click();
		await page.getByRole('button', { name: 'Mobile App' }).click();
		await page.getByRole('button', { name: 'Cache' }).click();
		await page.getByRole('button', { name: 'Remove tag Web' }).click();
		await page.getByLabelText('Add a tag').selectOptions('Data');
		await page.getByRole('button', { name: 'Remove link Docs' }).click();
		await page.getByLabelText('Link address').fill('github.com/acme/shop');
		await page.getByRole('button', { name: 'Add link' }).click();
		expect(changes.map(c => [c.label, c.change])).toEqual([
			['Change type', { type: 'Mobile App' }],
			['Flag cache', { flags: ['cache'] }],
			['Change tags', { tags: [] }],
			['Change tags', { tags: ['web', 'data'] }],
			['Remove link', { links: [] }],
			['Add link', { links: [{ label: 'Docs', url: 'example.com/docs' }, { url: 'https://github.com/acme/shop' }] }]
		]);
	});

	it('adds a link typed but not added once focus leaves the link form, and only once', async () => {
		const { changes } = await editing('gw');
		await page.getByLabelText('Link label').fill('Runbook');
		await page.getByLabelText('Link address').fill('example.com/run');
		await page.getByLabelText('Notes').click();
		await page.getByLabelText('Subtitle').click();
		expect(changes.filter(c => c.label === 'Add link').map(c => c.change)).toEqual([{ links: [{ label: 'Runbook', url: 'https://example.com/run' }] }]);
		await expect.element(page.getByLabelText('Link address')).toHaveValue('');
	});

	it('asks to duplicate or delete the node', async () => {
		const { calls } = await editing('db');
		await page.getByRole('button', { name: 'Duplicate' }).click();
		await page.getByRole('button', { name: 'Delete node' }).click();
		expect(calls).toEqual(['duplicate', 'delete']);
	});

	it('offers Isolate for a node with tags, read-only or not', async () => {
		let isolated = 0;
		await render(Inspector, { node: node('gw'), tags, onisolate: () => isolated++ });
		await page.getByRole('button', { name: 'Isolate its tags' }).click();
		expect(isolated).toBe(1);
	});

	it('gives a node its own icon from the library, and takes it back to its type’s', async () => {
		const { changes } = await editing(scene.nodes[0].id);
		await expect.element(page.getByText('The type’s icon')).toBeVisible();
		await page.getByRole('button', { name: /^Icon:/ }).click();
		await page.getByLabelText('Search icons').fill('robot');
		await page.getByRole('button', { name: 'Robot' }).click();
		expect(changes.at(-1)).toMatchObject({ change: { icon: 'robot' }, label: 'Change icon' });
	});

	it('offers the type’s icon back when the node has its own', async () => {
		const changes: NodeChange[] = [];
		await render(Inspector, { node: { ...scene.nodes[0], icon: 'robot', ownIcon: 'robot' }, tags, editable: true, onchange: c => changes.push(c) });
		await expect.element(page.getByRole('button', { name: 'Icon: Robot' })).toBeVisible();
		await page.getByRole('button', { name: 'Use the type’s' }).click();
		expect(changes).toEqual([{ icon: null }]);
	});
});

describe('the inspector and diagrams to zoom into', () => {
	const linked = toScene({
		version: 1,
		nodes: [{ id: 'api', name: 'API', type: 'service', links: [{ label: 'Runbook', url: 'example.com' }, { diagram: 'parts', view: 'Ops' }, { diagram: 'secret' }] }]
	}).nodes[0];
	const diagrams = [
		{ id: 'parts', name: 'API parts' },
		{ id: 'data', name: 'Data stores' }
	];

	it('opens a linked diagram, links another, and hides one the viewer cannot see', async () => {
		const changes: NodeChange[] = [];
		const zooms: string[] = [];
		await render(Inspector, { node: linked, tags: {}, editable: true, diagrams, onzoom: z => zooms.push(z.diagram), onchange: c => changes.push(c) });
		await page.getByRole('button', { name: /^API parts/ }).click();
		expect(zooms).toEqual(['parts']);
		expect(page.getByText('secret').elements()).toHaveLength(0);
		await page.getByLabelText('Link a diagram to zoom into').selectOptions('Data stores');
		expect(changes.at(-1)!.links).toEqual([{ label: 'Runbook', url: 'example.com' }, { diagram: 'parts', view: 'Ops' }, { diagram: 'secret' }, { diagram: 'data' }]);
	});

	it('keeps the diagram links when a web link is removed, and the web links when a diagram is unlinked', async () => {
		const changes: NodeChange[] = [];
		await render(Inspector, { node: linked, tags: {}, editable: true, diagrams, onchange: c => changes.push(c) });
		await page.getByRole('button', { name: 'Remove link Runbook' }).click();
		expect(changes.at(-1)!.links).toEqual([{ diagram: 'parts', view: 'Ops' }, { diagram: 'secret' }]);
		await page.getByRole('button', { name: 'Stop zooming into API parts' }).click();
		expect(changes.at(-1)!.links).toEqual([{ label: 'Runbook', url: 'example.com' }, { diagram: 'secret' }]);
	});

	it('lets a viewer zoom in but not link', async () => {
		await render(Inspector, { node: linked, tags: {}, diagrams });
		await expect.element(page.getByRole('button', { name: /^API parts/ })).toBeVisible();
		expect(page.getByLabelText('Link a diagram to zoom into').elements()).toHaveLength(0);
	});
});

describe('the inspector and new diagrams below a node', () => {
	const plain = toScene({ version: 1, nodes: [{ id: 'api', name: 'API', type: 'service' }] }).nodes[0];

	it('offers the next C4 level for a node that zooms into nothing, and shows a failure', async () => {
		const { kindOf } = await import('@khorum/daidal-core/kinds');
		let calls = 0;
		await render(Inspector, {
			node: plain,
			tags: {},
			editable: true,
			diagrams: [],
			kind: kindOf('c4-container'),
			onzoomnew: async () => {
				calls++;
				throw new Error('You can own at most 2 diagrams');
			}
		});
		await page.getByRole('button', { name: 'New C4 Component diagram' }).click();
		expect(calls).toBe(1);
		await expect.element(page.getByRole('alert')).toMatchTextContent('You can own at most 2 diagrams');
	});

	it('offers nothing below at the bottom of C4', async () => {
		const { kindOf } = await import('@khorum/daidal-core/kinds');
		await render(Inspector, { node: plain, tags: {}, editable: true, diagrams: [], kind: kindOf('c4-code'), onzoomnew: async () => {} });
		expect(page.getByRole('button', { name: /^New .* diagram$/ }).elements()).toHaveLength(0);
	});
});

describe('the inspector and new diagrams above a node', () => {
	const plain = toScene({ version: 1, nodes: [{ id: 'api', name: 'API', type: 'service' }] }).nodes[0];

	it('offers the C4 level above below Context, and nothing above Context', async () => {
		const { kindOf } = await import('@khorum/daidal-core/kinds');
		let calls = 0;
		await render(Inspector, { node: plain, tags: {}, editable: true, diagrams: [], kind: kindOf('c4-component'), onzoomup: async () => void calls++ });
		await page.getByRole('button', { name: 'New C4 Container diagram above' }).click();
		expect(calls).toBe(1);
	});

	it('offers none in a C4 Context diagram', async () => {
		const { kindOf } = await import('@khorum/daidal-core/kinds');
		await render(Inspector, { node: plain, tags: {}, editable: true, diagrams: [], kind: kindOf('c4-context'), onzoomup: async () => {} });
		expect(page.getByRole('button', { name: /diagram above$/ }).elements()).toHaveLength(0);
	});
});

describe("the inspector and a code block's functions", () => {
	const codeNode = (node: object) => toScene({ version: 1, diagram: { kind: 'c4-code' }, nodes: [{ id: 'chk', name: 'BalanceChecker', type: 'class', ...node }] }).nodes[0];
	async function editingCode(node: object) {
		const { kindOf } = await import('@khorum/daidal-core/kinds');
		const changes: { change: NodeChange; label: string; group?: string }[] = [];
		const calls: string[] = [];
		await render(Inspector, {
			node: codeNode(node),
			tags: {},
			editable: true,
			kind: kindOf('c4-code'),
			onchange: (change, label, group) => changes.push({ change, label, group }),
			onfieldend: () => calls.push('end')
		});
		return { changes, calls };
	}

	it('adds a function from its fields, saving it as typed, as one undo step', async () => {
		const { changes, calls } = await editingCode({});
		await page.getByRole('button', { name: '+ Add function' }).click();
		await expect.element(page.getByLabelText('Function name')).toHaveFocus();
		await page.getByLabelText('Function name').fill('check');
		await page.getByLabelText('Parameters').fill('batch: Batch, lines: Map<K, V>, ');
		// Half typed, the line stays as it is while the saved function reads what it can.
		await expect.element(page.getByLabelText('Parameters')).toHaveValue('batch: Batch, lines: Map<K, V>, ');
		await page.getByLabelText('Returns').fill('Verdict');
		await page.getByLabelText('What check does').fill('Rejects a batch that does not balance.');
		expect(changes.at(-1)).toEqual({
			change: {
				functions: [
					{
						name: 'check',
						params: [
							{ name: 'batch', type: 'Batch' },
							{ name: 'lines', type: 'Map<K, V>' }
						],
						returns: 'Verdict',
						notes: 'Rejects a batch that does not balance.'
					}
				]
			},
			label: 'Edit functions',
			group: 'chk:functions'
		});
		expect(new Set(changes.map(c => c.group))).toEqual(new Set(['chk:functions']));
		expect(calls).toEqual([]);
		await page.getByLabelText('Name').click();
		expect(calls).toEqual(['end']);
	});

	it('shows the functions it has, and removes one', async () => {
		const { changes } = await editingCode({ functions: [{ name: 'check', params: [{ name: 'batch', type: 'Batch' }], returns: 'Verdict' }, { name: 'reset' }] });
		await expect.element(page.getByRole('group', { name: 'Function check' }).getByLabelText('Parameters')).toHaveValue('batch: Batch');
		await expect.element(page.getByRole('group', { name: 'Function check' }).getByLabelText('Returns')).toHaveValue('Verdict');
		await page.getByRole('button', { name: 'Remove function check' }).click();
		expect(changes.at(-1)).toEqual({ change: { functions: [{ name: 'reset' }] }, label: 'Remove check', group: undefined });
	});

	it('moves functions written as text into fields, leaving the rest', async () => {
		const { changes } = await editingCode({ members: ['id: uuid', 'check(batch): Verdict'], subtitle: 'reset()' });
		await page.getByRole('button', { name: 'Make the 2 functions written as text into fields' }).click();
		expect(changes.at(-1)).toEqual({
			change: { functions: [{ name: 'check', params: [{ name: 'batch' }], returns: 'Verdict' }, { name: 'reset' }], members: ['id: uuid'], subtitle: '', notes: '' },
			label: 'Move functions out of text'
		});
	});

	it('offers no move when nothing written is a function', async () => {
		await editingCode({ members: ['id: uuid'] });
		expect(page.getByRole('button', { name: /written as text/ }).elements()).toHaveLength(0);
	});

	it('lists them read-only as signatures, with their notes', async () => {
		await render(Inspector, { node: codeNode({ functions: [{ name: 'check', params: [{ name: 'batch', type: 'Batch' }], returns: 'Verdict', notes: 'Rejects it.' }] }), tags: {} });
		await expect.element(page.getByRole('heading', { name: 'Functions' })).toBeVisible();
		await expect.element(page.getByText('(batch: Batch): Verdict')).toBeVisible();
		await expect.element(page.getByText('Rejects it.')).toBeVisible();
	});
});
