import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TourCallout from './TourCallout.svelte';
import type { TourStep } from '../tour';

const step: TourStep = { id: 'add', title: 'Add a node', body: 'Press **+ Add** and pick a type.', phoneBody: 'Tap **+ Add**.', targets: ['#target'], done: () => false };

function shown(props: Partial<{ index: number; total: number; narrow: boolean; step: TourStep }> = {}) {
	const calls: string[] = [];
	render(TourCallout, { step, index: 1, total: 5, onnext: () => calls.push('next'), onback: () => calls.push('back'), onend: () => calls.push('end'), ...props });
	return calls;
}

describe('a tour step', () => {
	it('shows its place, title and text with the bold bits, and goes back, on and away', async () => {
		const calls = shown();
		const card = page.getByRole('dialog', { name: 'Add a node' });
		await expect.element(card.getByText('Tour · 2 of 5')).toBeVisible();
		await expect.element(card.getByText('+ Add')).toBeVisible();
		await card.getByRole('button', { name: 'Back' }).click();
		await card.getByRole('button', { name: 'Skip' }).click();
		await card.getByRole('button', { name: 'End tour' }).click();
		expect(calls).toEqual(['back', 'next', 'end']);
	});

	it('uses the phone wording on a phone, and Finish on the last step', async () => {
		const calls = shown({ narrow: true, index: 4 });
		await expect.element(page.getByText('Tap')).toBeVisible();
		expect(page.getByRole('button', { name: 'Skip' }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Finish' }).click();
		expect(calls).toEqual(['end']);
	});

	it('rings the control it points at', async () => {
		const target = document.createElement('button');
		target.id = 'target';
		target.textContent = 'Add';
		Object.assign(target.style, { position: 'fixed', left: '100px', top: '100px', width: '80px', height: '30px' });
		document.body.append(target);
		shown({ index: 0 });
		await expect.poll(() => document.querySelector('.ring')).not.toBeNull();
		const ring = document.querySelector('.ring') as HTMLElement;
		expect(ring.style.left).toBe('96px');
		expect(page.getByRole('button', { name: 'Back' }).elements()).toHaveLength(0);
		target.remove();
	});
});
