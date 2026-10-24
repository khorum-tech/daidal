import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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

function mount(view: string | null = null, selected: string | null = null, editable = false) {
	const picked: (string | null)[] = [];
	const moved: [string, number, number][] = [];
	const details: string[] = [];
	const r = render(DiagramCanvas, {
		target: stage,
		props: {
			scene,
			on: tagsOn(scene, view),
			selected,
			onselect: id => picked.push(id),
			editable,
			onmove: (id, x, y) => moved.push([id, x, y]),
			ondetails: id => details.push(id)
		}
	});
	return { ...r, picked, moved, details };
}

/** The sheet's current offset and scale, from its transform. */
function sheet() {
	const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec((document.querySelector('[data-testid=diagram-sheet]') as HTMLElement).style.transform)!;
	return { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) };
}

/** Drag from the centre of [el] by (dx, dy), in steps, as a hand would: a mouse unless told otherwise. */
async function drag(el: Element, dx: number, dy: number, { pointerType = 'mouse', altKey = false } = {}) {
	const r = el.getBoundingClientRect();
	const x = r.left + r.width / 2;
	const y = r.top + r.height / 2;
	const fire = (type: string, px: number, py: number) =>
		el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, altKey, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: px, clientY: py }));
	fire('pointerdown', x, y);
	for (let i = 1; i <= 5; i++) fire('pointermove', x + (dx * i) / 5, y + (dy * i) / 5);
	fire('pointerup', x + dx, y + dy);
	await new Promise(r => requestAnimationFrame(() => r(null)));
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

	it('selects a node with a tap, asks for its details on a second, and clears on empty space', async () => {
		const { picked, details, rerender } = mount();
		const gw = page.getByRole('button', { name: 'API Gateway: Gateway' });
		await gw.click();
		expect(picked).toEqual(['gw']);
		expect(details).toEqual([]);
		await rerender({ selected: 'gw' });
		await expect.element(gw).toHaveAttribute('aria-pressed', 'true');
		await gw.click();
		expect(details).toEqual(['gw']);
		const r = document.querySelector('.canvas')!.getBoundingClientRect();
		await page.elementLocator(document.elementFromPoint(r.left + 5, r.top + 5)!).click();
		expect(picked.at(-1)).toBeNull();
	});

	it('asks for details from the keyboard when Enter is pressed on the selected node', async () => {
		const { picked, details } = mount(null, 'gw');
		(document.querySelector('[data-node="gw"]') as HTMLElement).focus();
		await userEvent.keyboard('{Enter}');
		expect(details).toEqual(['gw']);
		(document.querySelector('[data-node="shop"]') as HTMLElement).focus();
		await userEvent.keyboard('{Enter}');
		expect(picked).toEqual(['shop']);
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

	it('pans when dragging empty space, and stops before the diagram leaves the view', async () => {
		mount();
		const canvas = document.querySelector('.canvas')!;
		const before = sheet();
		// Grab a spot clear of the nodes: the canvas's top-left corner area.
		const r = canvas.getBoundingClientRect();
		const spot = document.elementFromPoint(r.left + 5, r.top + 5)!;
		await drag(spot, 120, 40);
		// The browser rounds the transform it writes back, so compare to a few decimals.
		const after = sheet();
		expect(after.tx).toBeCloseTo(before.tx + 120, 2);
		expect(after.ty).toBeCloseTo(before.ty + 40, 2);
		expect(after.s).toBe(before.s);
		await drag(spot, 5000, 0);
		expect(sheet().tx).toBeLessThan(before.tx + 1100);
	});

	it('moves a node with the mouse when editing is on, and says where it went', async () => {
		const { moved, picked } = mount(null, null, true);
		const gw = document.querySelector('[data-node="gw"]')!;
		const { s } = sheet();
		await drag(gw, 100 * s, 50 * s, { altKey: true }); // Alt: no snapping, so the drag lands exactly
		// Gateway starts at (340, 150); the drag was 100 × 50 in diagram units.
		expect(moved).toEqual([['gw', 440, 200]]);
		expect(picked).toEqual([]); // a drag is not a tap
	});

	it('snaps a dragged node into line with its neighbours, with a guide while dragging', async () => {
		const { moved } = mount(null, null, true);
		const gw = document.querySelector('[data-node="gw"]')!;
		const { s } = sheet();
		// Down by 263: Gateway's top would be at 413, 7 short of the collector's top at 420, so it snaps there.
		const r = gw.getBoundingClientRect();
		const fire = (type: string, dy: number) =>
			gw.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: r.left + 20, clientY: r.top + 20 + dy }));
		fire('pointerdown', 0);
		fire('pointermove', 100 * s);
		fire('pointermove', 263 * s);
		await expect.poll(() => document.querySelectorAll('line.guide').length).toBe(1);
		fire('pointerup', 263 * s);
		await expect.poll(() => moved.length).toBe(1);
		expect(moved[0]).toEqual(['gw', 340, 420]);
		expect(document.querySelectorAll('line.guide')).toHaveLength(0);
	});

	it('lets a finger move only the selected node; a swipe from any other pans', async () => {
		const unselected = mount(null, null, true);
		const before = sheet();
		await drag(document.querySelector('[data-node="gw"]')!, 50, 0, { pointerType: 'touch' });
		expect(unselected.moved).toEqual([]);
		expect(sheet().tx).toBeCloseTo(before.tx + 50, 2);
		unselected.unmount();

		const chosen = mount(null, 'gw', true);
		const { s } = sheet();
		await drag(document.querySelector('[data-node="gw"]')!, 0, 160 * s, { pointerType: 'touch', altKey: true });
		expect(chosen.moved).toEqual([['gw', 340, 310]]);
	});

	it('pans instead when editing is off, even from a node', async () => {
		const { moved } = mount();
		const before = sheet();
		await drag(document.querySelector('[data-node="gw"]')!, 60, 0);
		expect(moved).toEqual([]);
		expect(sheet().tx).toBeCloseTo(before.tx + 60, 2);
	});

	it('pans with the arrow keys and fits again with 0', async () => {
		mount();
		const canvas = page.getByRole('application');
		const before = sheet();
		(canvas.element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowLeft}');
		expect(sheet().tx).toBeCloseTo(before.tx + 60, 2);
		await userEvent.keyboard('0');
		expect(sheet()).toEqual(before);
	});
});
