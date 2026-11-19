// The only runtime globals core uses beyond ES2022. Both are in the minimum common web API (WinterTC) that browsers,
// Cloudflare Workers, Deno and Node 18+ all provide, so core still runs anywhere a diagram is drawn. Declared here,
// not taken from the DOM library, so the typecheck catches anything else (document, window, fetch, timers …).

declare function structuredClone<T>(value: T): T;

declare class URL {
	constructor(url: string, base?: string);
	readonly protocol: string;
	readonly host: string;
	readonly hostname: string;
	readonly href: string;
	readonly pathname: string;
}
