import { defineConfig } from 'vitest/config';

// The core's own tests, in plain Node: nothing here needs a browser or the Workers runtime.
export default defineConfig({
	root: import.meta.dirname,
	test: { name: 'core', environment: 'node', include: ['src/**/*.test.ts'], expect: { requireAssertions: true } }
});
