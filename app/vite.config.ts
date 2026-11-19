import { fileURLToPath } from 'node:url';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// A single-page app the Worker serves under /app; the site root redirects there.
			adapter: adapter({ fallback: 'index.html' }),
			// The page's Content-Security-Policy, as a meta tag with the hash of SvelteKit's one inline script. Styles
			// may be inline (Svelte sets style attributes); images may be data: or blob: (icons, PNG export); nothing
			// loads from anywhere else. The Worker adds frame-ancestors and the other headers (worker/src/headers.ts).
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['none'],
					'form-action': ['self']
				}
			},
			// Under Vitest the base would move the browser test runner's own scripts and stop them loading.
			paths: { base: process.env.VITEST ? '' : '/app' }
		})
	],
	server: {
		// `npm run dev` here talks to the Worker running under `wrangler dev` at the project root.
		proxy: { '/api': 'http://localhost:8787' },
		// The shared core (packages/core) sits outside app/, linked in through node_modules; the dev server and the
		// browser tests serve its source from there.
		fs: { allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../packages/core', import.meta.url))] }
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						// Desktop-sized, as the diagram page is laid out for; the default frame is phone-sized.
						viewport: { width: 1280, height: 900 },
						instances: [{ browser: 'chromium', headless: true }],
						// Vitest 5 made locators match whole, case-sensitive text by default; these tests find things by part of
						// their text (a label with a hint, a button with a badge), as Playwright's own locators do.
						locators: { exact: false }
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
