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
			// A single-page app the Worker serves under /app, beside the prototype at the site root.
			adapter: adapter({ fallback: 'index.html' }),
			// Under Vitest the base would move the browser test runner's own scripts and stop them loading.
			paths: { base: process.env.VITEST ? '' : '/app' }
		})
	],
	server: {
		// `npm run dev` here talks to the Worker running under `wrangler dev` at the project root.
		proxy: { '/api': 'http://localhost:8787' }
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
						instances: [{ browser: 'chromium', headless: true }]
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
