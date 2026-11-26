import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PanelResizer from './PanelResizer.svelte';

type Side = 'left' | 'right';

/** Renders a handle that follows what it reports, as the page does, and keeps each width it sent. */
async function handle(side: Side, { width = 300, min = 288, max = 700 } = {}) {
	const sent: number[] = [];
	let ends = 0;
	let rerender: ((props: { width: number }) => Promise<void>) | undefined;
	const r = await render(PanelResizer, {
		side,
		label: 'Resize the side panel',
		width,
		min,
		max,
		onresize: w => {
			sent.push(w);
			void rerender?.({ width: w });
		},
		onend: () => ends++
	});
	rerender = props => r.rerender(props);
	const el = page.getByRole('separator', { name: 'Resize the side panel' }).element() as HTMLElement;
	return { el, sent, ends: () => ends, unmount: () => r.unmount() };
}

function press(el: Element, type: string, x: number, pointerType = 'mouse') {
	el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: 100 }));
}

function drag(el: Element, dx: number, pointerType = 'mouse') {
	press(el, 'pointerdown', 500, pointerType);
	for (let i = 1; i <= 4; i++) press(el, 'pointermove', 500 + (dx * i) / 4, pointerType);
	press(el, 'pointerup', 500 + dx, pointerType);
}

function tap(el: Element, pointerType = 'mouse') {
	press(el, 'pointerdown', 500, pointerType);
	press(el, 'pointerup', 500, pointerType);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('a side panel resize handle', () => {
	it('is a vertical separator named for its panel, with the width as its value', async () => {
		const { el } = await handle('right', { width: 320, min: 288, max: 600 });
		expect(el.getAttribute('aria-orientation')).toBe('vertical');
		expect(el.getAttribute('aria-valuenow')).toBe('320');
		expect(el.getAttribute('aria-valuemin')).toBe('288');
		expect(el.getAttribute('aria-valuemax')).toBe('600');
		expect(el.tabIndex).toBe(0);
	});

	it('widens a left panel dragged right and a right panel dragged left, and reports the end once', async () => {
		const left = await handle('left', { width: 248, min: 248 });
		drag(left.el, 100);
		expect(left.sent.at(-1)).toBe(348);
		expect(left.ends()).toBe(1);
		left.unmount();

		const right = await handle('right');
		drag(right.el, -120);
		expect(right.sent.at(-1)).toBe(420);
		drag(right.el, 50);
		expect(right.sent.at(-1)).toBe(370);
		expect(right.ends()).toBe(2);
	});

	it('keeps within its smallest and largest widths', async () => {
		const { el, sent } = await handle('right', { width: 300, min: 288, max: 500 });
		drag(el, -900);
		expect(sent.at(-1)).toBe(500);
		drag(el, 900);
		expect(sent.at(-1)).toBe(288);
	});

	it('is dragged by a finger or a pen as by a mouse', async () => {
		for (const pointerType of ['touch', 'pen']) {
			const { el, sent, unmount } = await handle('left', { width: 248, min: 248 });
			drag(el, 60, pointerType);
			expect(sent.at(-1)).toBe(308);
			unmount();
		}
	});

	it('goes back to its smallest width on a double click or double tap, not on slow or single taps', async () => {
		for (const pointerType of ['mouse', 'touch']) {
			const { el, sent, unmount } = await handle('right', { width: 450 });
			tap(el, pointerType);
			expect(sent).toEqual([]);
			await sleep(450);
			tap(el, pointerType);
			expect(sent).toEqual([]);
			tap(el, pointerType);
			expect(sent).toEqual([288]);
			unmount();
		}
	});

	it('moves with the arrow keys, further with Shift, and to either end with Home and End', async () => {
		const { el, sent, ends } = await handle('right', { width: 300, min: 288, max: 500 });
		el.focus();
		await userEvent.keyboard('{ArrowLeft}');
		expect(sent.at(-1)).toBe(316);
		await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
		expect(sent.at(-1)).toBe(380);
		await userEvent.keyboard('{ArrowRight}');
		expect(sent.at(-1)).toBe(364);
		await userEvent.keyboard('{End}');
		expect(sent.at(-1)).toBe(500);
		await userEvent.keyboard('{Home}');
		expect(sent.at(-1)).toBe(288);
		expect(ends()).toBe(5);
	});

	it('grows a left panel with the right arrow key', async () => {
		const { el, sent } = await handle('left', { width: 248, min: 248 });
		el.focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(sent.at(-1)).toBe(264);
	});
});
