// Types for scripts/stage-config.mjs, so the Worker tests can import it under `strict`.
export declare const STAGE_NAME: string;
export declare const STAGE_HOST: string;
export declare const KNOWN_KEYS: Set<string>;
export declare function parseJsonc(text: string): Record<string, any>;
export declare function stageConfig(prod: Record<string, any>, env: Record<string, string | undefined>): Record<string, any>;
export declare function stageConfigText(prodText: string, env: Record<string, string | undefined>): string;
export declare function withoutAud(vars: Record<string, any> | undefined): Record<string, any>;
export declare function stageSecrets(env: Record<string, string | undefined>): { ACCESS_AUD: string };
export declare const STAGE_SECRETS_FILE: string;
