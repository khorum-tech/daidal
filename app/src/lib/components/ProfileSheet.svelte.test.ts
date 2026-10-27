import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ProfileSheet from './ProfileSheet.svelte';
import { DEFAULTS, type Settings } from '../appearance.svelte';

const me = { email: 'ada@example.com', name: 'Ada', title: '', settings: {} };

describe('the profile and appearance sheet', () => {
	it('saves a changed name and title, and says when it could not', async () => {
		const saved: unknown[] = [];
		let fail = true;
		render(ProfileSheet, {
			me,
			settings: DEFAULTS,
			light: false,
			onchange: () => {},
			onsave: async p => {
				if (fail) throw new Error('offline');
				saved.push(p);
			}
		});
		const save = page.getByRole('button', { name: 'Save profile' });
		await expect.element(save).toBeDisabled();
		await page.getByLabelText('Name').fill('Ada Lovelace ');
		await page.getByLabelText('Title').fill('Engineer');
		await save.click();
		await expect.element(page.getByRole('alert')).toHaveTextContent("Couldn't save: offline");
		fail = false;
		await save.click();
		expect(saved).toEqual([{ name: 'Ada Lovelace', title: 'Engineer' }]);
		await expect.element(page.getByLabelText('Email')).toHaveAttribute('readonly');
	});

	it('reports theme, condition, simulation and icon cards, and simulates only with a condition', async () => {
		const changes: Partial<Settings>[] = [];
		const screen = render(ProfileSheet, {
			me,
			settings: DEFAULTS,
			light: false,
			tab: 'appearance',
			onchange: c => changes.push(c),
			onsave: async () => {}
		});
		await expect.element(page.getByRole('checkbox', { name: /Simulate it/ })).toBeDisabled();
		await page.getByRole('radio', { name: 'Match system' }).click();
		await page.getByRole('radio', { name: 'Protanopia' }).click();
		await page.getByRole('checkbox', { name: /Icon-only cards/ }).click();
		expect(changes).toEqual([{ theme: 'system' }, { condition: 'protan' }, { iconCards: true }]);

		await screen.rerender({
			settings: { ...DEFAULTS, theme: 'system', condition: 'protan' }
		});
		await expect.element(page.getByText(/light or dark as it is \(dark now\)/)).toBeVisible();
		await expect.element(page.getByText(/struck from the tag colour pickers/)).toBeVisible();
		await page.getByRole('checkbox', { name: /Simulate it/ }).click();
		expect(changes.at(-1)).toEqual({ simulate: true });
	});
});
