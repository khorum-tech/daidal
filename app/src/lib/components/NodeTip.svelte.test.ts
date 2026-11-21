import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import NodeTip from './NodeTip.svelte';
import { toScene } from '@khorum/daidal-core/model';
import { SAMPLE } from '@khorum/daidal-core/fixtures';

const scene = toScene(SAMPLE);
const tags = Object.fromEntries(scene.tags.map(t => [t.key, t]));
const gw = scene.nodes.find(n => n.id === 'gw')!;

describe('the node tip', () => {
	it("shows a node's type, name, notes and tags, and up to four connections", async () => {
		const connections = Array.from({ length: 6 }, (_, i) => ({ out: i % 2 === 0, name: `Node ${i}`, label: i ? '' : 'HTTPS' }));
		await render(NodeTip, { node: gw, tags, connections });
		const tip = page.getByRole('tooltip', { name: 'About Gateway' });
		await expect.element(tip).toMatchTextContent(/API Gateway.*Gateway.*The one way in\./);
		await expect.element(tip.getByText(tags[gw.tags[0]].label, { exact: true })).toBeVisible();
		await expect.element(tip.getByText('HTTPS')).toBeVisible();
		await expect.element(tip.getByText('Node 3')).toBeVisible();
		expect(tip.getByText('Node 4').elements()).toHaveLength(0);
		await expect.element(tip.getByText('and 2 more')).toBeVisible();
	});

	it('as a View, shows every connection and its links, as a region rather than a tooltip', async () => {
		const connections = Array.from({ length: 6 }, (_, i) => ({ out: true, name: `Node ${i}`, label: '' }));
		const linked = { ...gw, links: [{ label: 'Runbook', url: 'https://example.com/run' }, { url: 'https://docs.example.com/x' }] };
		await render(NodeTip, { node: linked, tags, connections, full: true });
		const view = page.getByRole('region', { name: 'About Gateway' });
		await expect.element(view.getByText('Node 5')).toBeVisible();
		expect(view.getByText(/more$/).elements()).toHaveLength(0);
		await expect.element(view.getByRole('link', { name: 'Runbook' })).toHaveAttribute('href', 'https://example.com/run');
		await expect.element(view.getByRole('link', { name: 'docs.example.com' })).toBeVisible();
	});
});
