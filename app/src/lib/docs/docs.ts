// Skope's in-app docs (/app/docs): one markdown file per page in this folder, each opening with a small header:
//
//   ---
//   title: Getting started
//   summary: One line for the contents list.
//   order: 1
//   ---
//
// The slug is the file's name. Links between pages are written /app/docs/<slug>; docs.test.ts checks every one.
import { Marked } from 'marked';

export interface DocPage {
	slug: string;
	title: string;
	summary: string;
	order: number;
	/** The page's markdown, without its header. */
	body: string;
}

const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** [text] split into its header fields and the markdown after it. */
export function parsePage(slug: string, text: string): DocPage {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	const fields: Record<string, string> = {};
	for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
		const at = line.indexOf(':');
		if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
	}
	const order = Number(fields.order);
	return {
		slug,
		title: fields.title || slug,
		summary: fields.summary ?? '',
		order: Number.isFinite(order) ? order : 999,
		body: (m ? text.slice(m[0].length) : text).trimStart()
	};
}

/** Every page, in reading order. */
export const PAGES: DocPage[] = Object.entries(files)
	.map(([path, text]) => parsePage(path.replace(/^\.\/|\.md$/g, ''), text))
	.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export const pageOf = (slug: string): DocPage | undefined => PAGES.find(p => p.slug === slug);

/** The page before and after [slug], for Previous and Next. */
export function neighbours(slug: string): { prev?: DocPage; next?: DocPage } {
	const i = PAGES.findIndex(p => p.slug === slug);
	return i < 0 ? {} : { prev: PAGES[i - 1], next: PAGES[i + 1] };
}

/** Every /app/docs/… link in [body], without any #part. */
export function docLinks(body: string): string[] {
	return [...body.matchAll(/\]\(\/app\/docs\/([^)#\s]*)/g)].map(m => m[1]);
}

/** Every picture in [body] (from app/static/docs-images, served at /app/docs-images), by file name. */
export function docImages(body: string): string[] {
	return [...body.matchAll(/!\[[^\]]*\]\(\/app\/docs-images\/([^)\s]+)\)/g)].map(m => m[1]);
}

const marked = new Marked({ gfm: true });

/** A page's markdown as HTML. The pages are Skope's own, so nothing in them needs sanitising. */
export const render = (body: string): string => marked.parse(body, { async: false });
