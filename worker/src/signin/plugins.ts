import type { ProviderPlugin } from "./provider";
import { GENERATED } from "./plugins.generated";

/**
 * Sign-in providers from packages outside this repository. Workers can't import code at run time, so plugins are
 * bundled at build time: `DAIDAL_AUTH_PLUGINS` (package names, separated by commas) makes `scripts/auth-plugins.mjs`
 * rewrite `plugins.generated.ts` to import each one's default export before the build. See docs/sign-in.md.
 */
export const PLUGINS: ProviderPlugin[] = GENERATED;
