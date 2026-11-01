import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DocsNav from './DocsNav.svelte';
import { PAGES } from '../docs/docs';

const href = (slug: string) => `/app/docs/${slug}`;

describe('the docs contents', () => {
	it('lists every page, marking the one open', async () => {
		render(DocsNav, { pages: PAGES, current: 'nodes', href });
		const nav = page.getByRole('navigation', { name: 'Docs' });
		await expect.element(nav.getByRole('link', { name: 'Getting started' })).toHaveAttribute('href', '/app/docs/getting-started');
		await expect.element(nav.getByRole('link', { name: 'Nodes' })).toHaveAttribute('aria-current', 'page');
		await expect.element(nav.getByRole('link', { name: 'All docs' })).not.toHaveAttribute('aria-current');
		expect(nav.getByRole('listitem').elements()).toHaveLength(PAGES.length);
	});

	it('marks All docs on the contents page', async () => {
		render(DocsNav, { pages: PAGES, href });
		await expect.element(page.getByRole('link', { name: 'All docs' })).toHaveAttribute('aria-current', 'page');
	});
});
