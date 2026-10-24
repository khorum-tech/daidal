import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DiagramCanvas from './DiagramCanvas.svelte';
import { tagsOn, toScene } from '../diagram/model';
import { SAMPLE } from '../fixtures/docs';
import '../styles/nocturne.css';

const scene = toScene(SAMPLE);

// The canvas fills its parent, as it does on the diagram page; a parent with no height would clip it to nothing.
let stage: HTMLElement;
beforeEach(() => {
	stage = document.createElement('div');
	stage.style.cssText = 'width:1100px;height:700px;position:relative';
	document.body.replaceChildren(stage);
});

function mount(view: string | null = null, selected: string | null = null) {
	const picked: (string | null)[] = [];
	const r = render(DiagramCanvas, { target: stage, props: { scene, on: tagsOn(scene, view), selected, onselect: id => picked.push(id) } });
	return { ...r, picked };
}

describe('the canvas', () => {
	it('draws every node, connection, label and container', async () => {
		const { container } = mount();
		for (const name of ['Web App: Shop', 'API Gateway: Gateway', 'Database: Orders DB', 'Telemetry: Collector']) {
			await expect.element(page.getByRole('button', { name })).toBeVisible();
		}
		await expect.element(page.getByText('Draft — not agreed yet')).toBeVisible();
		await expect.element(page.getByText('HTTPS')).toBeVisible();
		await expect.element(page.getByText('Prod')).toBeVisible();
		// Four connections, one of them to a container; a hidden label stays hidden.
		expect(container.querySelectorAll('path[data-edge]')).toHaveLength(4);
		expect(container.querySelector('path[data-edge="gw>zone"]')).not.toBeNull();
		expect(page.getByText('traces').query()).toBeNull();
	});

	it('styles connections as the document says', async () => {
		const { container } = mount();
		const sql = container.querySelector('path[data-edge="gw>db"]')!;
		expect(sql.getAttribute('stroke-dasharray')).toBe('5.6 4.5');
		expect(sql.getAttribute('d')).toContain(' Q');
		const traces = container.querySelector('path[data-edge="otel>gw"]')!;
		expect(traces.getAttribute('marker-start')).toBe('url(#arrRevThin)');
		expect(traces.getAttribute('marker-end')).toBe('url(#arrThin)');
		expect(container.querySelector('path[data-edge="gw>zone"]')!.getAttribute('marker-end')).toBeNull();
	});

	it('ghosts what the chosen view leaves out, instead of hiding it', async () => {
		const { container } = mount('Request path');
		await expect.element(page.getByRole('button', { name: 'Database: Orders DB' })).toHaveStyle({ opacity: '0.22' });
		await expect.element(page.getByRole('button', { name: 'Web App: Shop' })).toHaveStyle({ opacity: '1' });
		// The untagged text node always shows; a connection to a ghosted node fades with it.
		await expect.element(page.getByRole('button', { name: 'Text: Draft — not agreed yet' })).toHaveStyle({ opacity: '1' });
		expect(Number(container.querySelector('path[data-edge="gw>db"]')!.getAttribute('opacity'))).toBeCloseTo(0.154);
	});

	it('selects a node, and clicking it again lets go', async () => {
		const { picked, rerender } = mount();
		await page.getByRole('button', { name: 'API Gateway: Gateway' }).click();
		expect(picked).toEqual(['gw']);
		await rerender({ selected: 'gw' });
		await expect.element(page.getByRole('button', { name: 'API Gateway: Gateway' })).toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'API Gateway: Gateway' }).click();
		expect(picked).toEqual(['gw', null]);
	});

	it('zooms in steps and back to fit', async () => {
		mount();
		const fit = page.getByRole('button', { name: /%$/ });
		const before = (await fit.element().textContent) ?? '';
		await page.getByRole('button', { name: 'Zoom in' }).click();
		await expect.element(fit).not.toHaveTextContent(before);
		await fit.click();
		await expect.element(fit).toHaveTextContent(before);
	});
});
