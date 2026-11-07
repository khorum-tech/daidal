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
		await render(ProfileSheet, {
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
		await expect.element(page.getByRole('alert')).toMatchTextContent("Couldn't save: offline");
		fail = false;
		await save.click();
		expect(saved).toEqual([{ name: 'Ada Lovelace', title: 'Engineer' }]);
		await expect.element(page.getByLabelText('Email')).toHaveAttribute('readonly');
	});

	it('reports theme, condition, simulation and icon cards, and simulates only with a condition', async () => {
		const changes: Partial<Settings>[] = [];
		const screen = await render(ProfileSheet, {
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

	it('downloads your data, and deletes the account only once your email is typed', async () => {
		const calls: string[] = [];
		await render(ProfileSheet, {
			me,
			settings: DEFAULTS,
			light: false,
			onchange: () => {},
			onsave: async () => {},
			ondownload: async () => {
				calls.push('download');
			},
			ondelete: async confirm => {
				calls.push(`delete ${confirm}`);
			}
		});
		await page.getByRole('button', { name: 'Download my data' }).click();
		await page.getByRole('button', { name: 'Delete my account…' }).click();
		const go = page.getByRole('button', { name: 'Delete everything' });
		await expect.element(go).toBeDisabled();
		await page.getByLabelText(/Type your email/).fill('someone@example.com');
		await expect.element(go).toBeDisabled();
		await page.getByLabelText(/Type your email/).fill(' ADA@example.com ');
		await go.click();
		expect(calls).toEqual(['download', 'delete ADA@example.com']);
	});

	it('keeps the account when you back out, and says why a delete failed', async () => {
		await render(ProfileSheet, {
			me,
			settings: DEFAULTS,
			light: false,
			onchange: () => {},
			onsave: async () => {},
			ondelete: async () => {
				throw new Error('offline');
			}
		});
		await page.getByRole('button', { name: 'Delete my account…' }).click();
		await page.getByLabelText(/Type your email/).fill('ada@example.com');
		await page.getByRole('button', { name: 'Delete everything' }).click();
		await expect.element(page.getByRole('alert')).toMatchTextContent("Couldn't delete your account: offline");
		await page.getByRole('button', { name: 'Keep my account' }).click();
		await expect.element(page.getByRole('button', { name: 'Delete my account…' })).toBeVisible();
	});
});
