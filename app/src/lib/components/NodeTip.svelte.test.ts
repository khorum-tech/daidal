import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import NodeTip from './NodeTip.svelte';
import { toScene } from '../diagram/model';
import { SAMPLE } from '../fixtures/docs';

const scene = toScene(SAMPLE);
const tags = Object.fromEntries(scene.tags.map(t => [t.key, t]));
const gw = scene.nodes.find(n => n.id === 'gw')!;

describe('the node tip', () => {
	it("shows a node's type, name, notes and tags, and up to four connections", async () => {
		const connections = Array.from({ length: 6 }, (_, i) => ({ out: i % 2 === 0, name: `Node ${i}`, label: i ? '' : 'HTTPS' }));
		render(NodeTip, { node: gw, tags, connections });
		const tip = page.getByRole('tooltip', { name: 'About Gateway' });
		await expect.element(tip).toHaveTextContent(/API Gateway.*Gateway.*The one way in\./);
		await expect.element(tip.getByText(tags[gw.tags[0]].label, { exact: true })).toBeVisible();
		await expect.element(tip.getByText('HTTPS')).toBeVisible();
		await expect.element(tip.getByText('Node 3')).toBeVisible();
		expect(tip.getByText('Node 4').elements()).toHaveLength(0);
		await expect.element(tip.getByText('and 2 more')).toBeVisible();
	});
});
