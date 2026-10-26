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

function mount(view: string | null = null, selected: string | null = null, editable = false, moving = false) {
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
			moving,
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

	it('selects a node with a tap, keeps it on a second, and clears on empty space', async () => {
		const { picked, details, rerender } = mount();
		const gw = page.getByRole('button', { name: 'API Gateway: Gateway' });
		await gw.click();
		expect(picked).toEqual(['gw']);
		await rerender({ selected: 'gw' });
		await expect.element(gw).toHaveAttribute('aria-pressed', 'true');
		await gw.click();
		expect(picked).toEqual(['gw', 'gw']);
		expect(details).toEqual([]);
		const r = document.querySelector('.canvas')!.getBoundingClientRect();
		await page.elementLocator(document.elementFromPoint(r.left + 5, r.top + 5)!).click();
		expect(picked.at(-1)).toBeNull();
	});

	it('does not take the click that ends a drag for a tap', async () => {
		const { picked, moved } = mount(null, null, true);
		const gw = document.querySelector('[data-node="gw"]')!;
		await drag(gw, 40, 0, { altKey: true });
		gw.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		expect(moved).toHaveLength(1);
		expect(picked).toEqual([]);
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

	it('pans under a finger, even one that starts on a node, unless moving mode is on', async () => {
		const plain = mount(null, 'gw', true);
		const before = sheet();
		await drag(document.querySelector('[data-node="gw"]')!, 50, 0, { pointerType: 'touch' });
		expect(plain.moved).toEqual([]);
		expect(sheet().tx).toBeCloseTo(before.tx + 50, 2);
		plain.unmount();

		// Moving mode: a drag from anywhere, empty space included, moves the selected node.
		const moving = mount(null, 'gw', true, true);
		const { s } = sheet();
		const r = document.querySelector('.canvas')!.getBoundingClientRect();
		const empty = document.elementFromPoint(r.left + 5, r.top + 5)!;
		await drag(empty, 0, 160 * s, { pointerType: 'touch', altKey: true });
		expect(moving.moved).toEqual([['gw', 340, 310]]);
		expect(sheet().tx).toBeCloseTo(before.tx, 2); // and the view stayed put
	});

	it('never captures a touch pointer (WebKit throws on it), only a mouse', async () => {
		mount(null, 'gw', true, true);
		const canvas = document.querySelector('.canvas') as HTMLElement;
		const calls: string[] = [];
		canvas.setPointerCapture = (id: number) => {
			calls.push(String(id));
			throw new DOMException('The object can not be found here.', 'NotFoundError');
		};
		await drag(document.querySelector('[data-node="gw"]')!, 30, 0, { pointerType: 'touch' });
		expect(calls).toEqual([]);
		await drag(document.querySelector('[data-node="gw"]')!, 30, 0); // a mouse: captured, and the throw is survived
		expect(calls).toEqual(['1']);
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

describe('the canvas tools', () => {
	function mountTools(props: Record<string, unknown> = {}) {
		const calls: { connect: [string, string | null][]; start: string[]; picked: (string | null)[]; added: { x: number; y: number }[]; renameStart: string[]; renamed: [string, string | null][]; resized: [string, number, number][]; moved: [string, number, number][]; snap: boolean[] } = {
			connect: [],
			start: [],
			picked: [],
			added: [],
			renameStart: [],
			renamed: [],
			resized: [],
			moved: [],
			snap: []
		};
		const r = render(DiagramCanvas, {
			target: stage,
			props: {
				scene,
				on: tagsOn(scene, null),
				editable: true,
				onselect: id => calls.picked.push(id),
				onconnect: (from, to) => calls.connect.push([from, to]),
				onconnectstart: id => calls.start.push(id),
				onaddat: at => calls.added.push(at),
				onrenamestart: id => calls.renameStart.push(id),
				onrename: (id, name) => calls.renamed.push([id, name]),
				onresize: (id, w, h) => calls.resized.push([id, w, h]),
				onmove: (id, x, y) => calls.moved.push([id, x, y]),
				onsnap: on => calls.snap.push(on),
				...props
			}
		});
		return { ...r, calls };
	}
	const empty = () => {
		const r = document.querySelector('.canvas')!.getBoundingClientRect();
		return document.elementFromPoint(r.left + 5, r.top + 5)!;
	};

	it('makes a new node for a connection when empty canvas is tapped, instead of cancelling it', async () => {
		const { calls } = mountTools({ selected: 'gw', connectFrom: 'gw' });
		await page.elementLocator(empty()).click();
		expect(calls.connect).toEqual([['gw', null]]);
		expect(calls.picked).toEqual([]);
	});

	it('starts a connection from the node tapped while picking, without selecting it', async () => {
		const { calls } = mountTools({ picking: true });
		await page.getByRole('button', { name: 'API Gateway: Gateway' }).click();
		expect(calls.start).toEqual(['gw']);
		expect(calls.picked).toEqual([]);
		expect(document.querySelector('.port')).toBeNull();
	});

	it('asks for a node on a double-click of empty canvas, and to rename on a double-click of a node', async () => {
		const { calls } = mountTools();
		await userEvent.dblClick(page.elementLocator(empty()));
		expect(calls.added).toHaveLength(1);
		await userEvent.dblClick(page.getByRole('button', { name: 'API Gateway: Gateway' }));
		expect(calls.renameStart).toEqual(['gw']);
		expect(calls.added).toHaveLength(1);
	});

	it("ignores a finger's double tap", async () => {
		const { calls } = mountTools();
		const el = empty();
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 }));
		el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 }));
		el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
		expect(calls.added).toEqual([]);
	});

	it('types a new name in place: Enter keeps it, Escape leaves the old one', async () => {
		const { calls, rerender } = mountTools({ selected: 'gw', renaming: 'gw' });
		const input = page.getByRole('textbox', { name: 'Name of Gateway' });
		await expect.element(input).toHaveFocus();
		await expect.element(input).toHaveValue('Gateway');
		await userEvent.keyboard('Front door{Enter}');
		expect(calls.renamed).toEqual([['gw', 'Front door']]);
		await rerender({ renaming: null });
		await rerender({ renaming: 'gw' });
		await expect.element(page.getByRole('textbox', { name: 'Name of Gateway' })).toHaveFocus();
		await userEvent.keyboard('Nope{Escape}');
		expect(calls.renamed.at(-1)).toEqual(['gw', null]);
	});

	it('resizes the selected node by its corner handle, with a mouse or a finger, no smaller than the limit', async () => {
		const { calls } = mountTools({ selected: 'gw' });
		const { s } = sheet();
		await drag(document.querySelector('.n-resize')!, 60 * s, 20 * s);
		// Gateway is 190 × 88; the drag was 60 × 20 in diagram units.
		expect(calls.resized).toEqual([['gw', 250, 108]]);
		await drag(document.querySelector('.n-resize')!, -400 * s, -400 * s, { pointerType: 'touch' });
		expect(calls.resized.at(-1)).toEqual(['gw', 130, 64]);
		expect(calls.moved).toEqual([]);
	});

	it('places a dragged node freely with snapping off, and switches it from the zoom bar', async () => {
		const { calls } = mountTools({ snap: false });
		const gw = document.querySelector('[data-node="gw"]')!;
		const { s } = sheet();
		await drag(gw, 0, 263 * s); // with snapping on, this lands on the collector's line at 420 (see above)
		expect(calls.moved).toEqual([['gw', 340, 413]]);
		const button = page.getByRole('button', { name: 'Snap nodes into line' });
		await expect.element(button).toHaveAttribute('aria-pressed', 'false');
		await button.click();
		expect(calls.snap).toEqual([true]);
	});
});
