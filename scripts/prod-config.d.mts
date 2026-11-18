// Types for scripts/prod-config.mjs, so the Worker tests can import it under `strict`.
export declare const PLACEHOLDER_D1_ID: string;
export declare function prodConfig(base: Record<string, any>, env: Record<string, string | undefined>): Record<string, any>;
export declare function prodConfigText(baseText: string, env: Record<string, string | undefined>): string;
export declare function prodSecrets(env: Record<string, string | undefined>): { ACCESS_AUD: string };
export declare const PROD_SECRETS_FILE: string;
