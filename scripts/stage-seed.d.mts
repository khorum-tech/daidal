// Types for scripts/stage-seed.mjs, so the Worker tests can import it under `strict`.
export declare const APP_TABLES: string[];
export declare const TEAMMATES: { email: string; name: string; title: string; settings: Record<string, unknown> }[];
export declare function literal(value: string | number | null | undefined): string;
export declare function stageRows(ownerEmail: string, now: number): Record<string, Record<string, string | number>[]>;
export declare function buildSeed(ownerEmail: string, now: number): string;
