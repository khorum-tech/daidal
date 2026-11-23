import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DiagramSheet from './DiagramSheet.svelte';
import type { Workspace } from '../types';

const workspaces: Workspace[] = [
	{ id: 'p', name: 'Personal', ownerEmail: 'a@x.io', personal: true, members: ['a@x.io'], types: [], groups: [] },
	{ id: 't', name: 'Platform team', ownerEmail: 'a@x.io', personal: false, members: ['a@x.io', 'b@x.io'], types: [], groups: [] }
];

describe('the diagram sheet', () => {
	it('lists the diagrams above and below by zooming, each a link, and leaves the section out when there are none', async () => {
		const linked = {
			above: [{ id: 'ctx', name: 'Ledger context', href: '/app/d/ctx?focus=me' }],
			below: [{ id: 'parts', name: 'Postings parts', href: '/app/d/parts?from=me', via: ['Postings API', 'Worker'] }]
		};
		const shown = await render(DiagramSheet, { name: 'ledger', mine: false, workspaces, here: 't', linked, onrename: () => {}, oncopy: async () => {}, ondelete: async () => {} });
		const section = page.getByRole('region', { name: 'Linked diagrams' });
		await expect.element(section.getByRole('link', { name: /Ledger context/ })).toHaveAttribute('href', '/app/d/ctx?focus=me');
		await expect.element(section.getByRole('link', { name: /Postings parts/ })).toHaveAttribute('href', '/app/d/parts?from=me');
		await expect.element(section.getByText('from Postings API, Worker')).toBeVisible();
		await shown.unmount();

		await render(DiagramSheet, { name: 'ledger', mine: false, workspaces, here: 't', onrename: () => {}, oncopy: async () => {}, ondelete: async () => {} });
		expect(page.getByRole('region', { name: 'Linked diagrams' }).elements()).toHaveLength(0);
	});

	it("files it under one of its workspace's groups, a new one, or none, for its owner only", async () => {
		const filed: (string | null)[] = [];
		const grouped = workspaces.map(w => (w.id === 't' ? { ...w, groups: [{ name: 'Ledger C4', diagrams: 3 }] } : w));
		const shown = await render(DiagramSheet, {
			name: 'ledger',
			mine: true,
			workspaces: grouped,
			here: 't',
			group: null,
			ongroup: async g => void filed.push(g),
			onrename: () => {},
			oncopy: async () => {},
			ondelete: async () => {}
		});
		const picker = page.getByRole('group', { name: 'Group' });
		await expect.element(picker.getByRole('radio', { name: 'No group' })).toHaveAttribute('aria-checked', 'true');
		await picker.getByRole('radio', { name: 'Ledger C4' }).click();
		await picker.getByLabelText('New group').fill('Payments');
		await picker.getByRole('button', { name: 'Add' }).click();
		await expect.poll(() => filed).toEqual(['Ledger C4', 'Payments']);
		await shown.unmount();

		await render(DiagramSheet, { name: 'ledger', mine: false, workspaces: grouped, here: 't', ongroup: async () => {}, onrename: () => {}, oncopy: async () => {}, ondelete: async () => {} });
		expect(page.getByRole('group', { name: 'Group' }).elements()).toHaveLength(0);
	});

	it('lets the owner rename, copy and delete, after asking', async () => {
		const calls: unknown[] = [];
		await render(DiagramSheet, {
			name: 'ledger',
			mine: true,
			workspaces,
			here: 't',
			onrename: n => calls.push(['rename', n]),
			oncopy: async c => void calls.push(['copy', c]),
			ondelete: async () => void calls.push(['delete'])
		});
		await page.getByLabelText('Name').fill('ledger-core');
		await expect.element(page.getByLabelText('Into')).toHaveValue('t');
		await expect.element(page.getByLabelText('Called')).toHaveValue('ledger copy');
		await page.getByRole('radio', { name: /Follow/ }).click();
		await page.getByLabelText('Into').selectOptions('Personal');
		await page.getByRole('button', { name: 'Make a follower' }).click();
		await page.getByRole('button', { name: 'Delete diagram…' }).click();
		await page.getByRole('button', { name: 'Delete for good' }).click();
		expect(calls).toEqual([['rename', 'ledger-core'], ['copy', { workspace: 'p', name: 'ledger copy', follow: true }], ['delete']]);
	});

	it('lets the owner change the kind, which says what it does', async () => {
		const kinds: string[] = [];
		await render(DiagramSheet, { name: 'ledger', mine: true, workspaces, here: 't', kind: 'c4-container', onkind: k => kinds.push(k), onrename: () => {}, oncopy: async () => {}, ondelete: async () => {} });
		await expect.element(page.getByLabelText('Kind', { exact: true })).toHaveValue('c4-container');
		await expect.element(page.getByText(/Level 2: the apps and data stores inside one system/)).toBeVisible();
		await page.getByLabelText('Kind', { exact: true }).selectOptions('C4 Component');
		expect(kinds).toEqual(['c4-component']);
	});

	it('only offers a copy to someone who does not own the diagram, and shows a failure', async () => {
		await render(DiagramSheet, {
			name: 'ledger',
			mine: false,
			workspaces,
			here: 'elsewhere',
			onrename: () => {},
			oncopy: async () => {
				throw new Error('workspace not found');
			},
			ondelete: async () => {}
		});
		expect(page.getByLabelText('Name').elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Delete diagram…' }).elements()).toHaveLength(0);
		await expect.element(page.getByLabelText('Into')).toHaveValue('p');
		await page.getByRole('button', { name: 'Make a duplicate' }).click();
		await expect.element(page.getByRole('alert')).toMatchTextContent('workspace not found');
	});

	it('copies a link, to the view on now if wanted, presents, and locks editing on this device', async () => {
		const calls: unknown[] = [];
		const written: string[] = [];
		Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
		await render(DiagramSheet, {
			name: 'ledger',
			mine: true,
			workspaces,
			here: 't',
			onrename: () => {},
			oncopy: async () => {},
			ondelete: async () => {},
			link: 'https://skope.example/app/d/abc',
			viewName: 'On call',
			onpresent: () => calls.push('present'),
			locked: false,
			onlock: (l: boolean) => calls.push(['lock', l])
		});
		const field = page.getByLabelText('Link to this diagram');
		await expect.element(field).toHaveValue('https://skope.example/app/d/abc?view=On%20call');
		await page.getByRole('button', { name: 'Copy link' }).click();
		await expect.element(page.getByRole('button', { name: 'Copied' })).toBeVisible();
		await page.getByLabelText('Open on the view “On call”').click();
		await expect.element(field).toHaveValue('https://skope.example/app/d/abc');
		await page.getByRole('button', { name: 'Present' }).click();
		await page.getByLabelText('Lock editing on this device').click();
		expect(written).toEqual(['https://skope.example/app/d/abc?view=On%20call']);
		expect(calls).toEqual(['present', ['lock', true]]);
	});

	it('offers no lock to someone who does not own the diagram', async () => {
		await render(DiagramSheet, { name: 'ledger', mine: false, workspaces, here: 't', onrename: () => {}, oncopy: async () => {}, ondelete: async () => {}, link: 'x', onlock: () => {} });
		await expect.element(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
		expect(page.getByLabelText('Lock editing on this device').elements()).toHaveLength(0);
	});

	it('exports an image as PNG or SVG, keeping what the view ghosts or not', async () => {
		const asked: [string, boolean][] = [];
		await render(DiagramSheet, {
			name: 'ledger',
			mine: false,
			workspaces,
			here: 't',
			onrename: () => {},
			oncopy: async () => {},
			ondelete: async () => {},
			onexport: async (format: 'png' | 'svg', ghosted: boolean) => void asked.push([format, ghosted])
		});
		await page.getByRole('button', { name: 'Download PNG' }).click();
		await page.getByLabelText('Keep what the view switches off, faintly').click();
		await page.getByRole('button', { name: 'Download SVG' }).click();
		expect(asked).toEqual([
			['png', true],
			['svg', false]
		]);
	});

	it('says so when an export fails', async () => {
		await render(DiagramSheet, { name: 'ledger', mine: true, workspaces, here: 't', onrename: () => {}, oncopy: async () => {}, ondelete: async () => {}, onexport: async () => Promise.reject(new Error("Couldn't make the PNG")) });
		await page.getByRole('button', { name: 'Download PNG' }).click();
		await expect.element(page.getByRole('alert')).toMatchTextContent("Couldn't make the PNG");
	});

	it('lets the owner move it to another of their workspaces', async () => {
		const moved: string[] = [];
		await render(DiagramSheet, { name: 'ledger', mine: true, workspaces, here: 't', onrename: () => {}, oncopy: async () => {}, ondelete: async () => {}, onmove: async w => void moved.push(w) });
		const move = page.getByRole('button', { name: 'Move the diagram' });
		await expect.element(move).toBeDisabled();
		await page.getByLabelText('Move to').selectOptions('Personal');
		await move.click();
		expect(moved).toEqual(['p']);
	});
});
