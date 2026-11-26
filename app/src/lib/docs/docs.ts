// Daidal's in-app docs (/app/docs): one markdown file per page in this folder, each opening with a small header:
//
//   ---
//   title: Getting started
//   summary: One line for the contents list.
//   order: 1
//   ---
//
// The slug is the file's name. Links between pages are written /app/docs/<slug>; docs.test.ts checks every one.
//
// Daidal's own addresses are written as placeholders, {{DAIDAL_URL}} and the rest (see site.ts), so a copy run
// elsewhere shows its own. A line that uses an address left empty (no stage, say) is left out.
import { Marked, type Tokens } from 'marked';
import { DAIDAL_SITE, placeholders, type SiteUrls } from './site';
import IMAGE_SIZES from './image-sizes.json';

export interface DocPage {
	slug: string;
	title: string;
	summary: string;
	order: number;
	/** The page's markdown, without its header. */
	body: string;
}

const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The addresses this build was given (vite.config.ts reads them from the environment). */
declare const __DAIDAL_SITE__: SiteUrls | undefined;
/** The build's addresses, or Daidal's own wherever the build didn't define them. */
function builtSite(): SiteUrls {
	try {
		return __DAIDAL_SITE__ ?? DAIDAL_SITE;
	} catch {
		// A tool that loads this file without vite.config.ts never defines the name, so reading it throws.
		return DAIDAL_SITE;
	}
}
export const SITE: SiteUrls = builtSite();

/**
 * [text] with each {{NAME}} placeholder replaced by its address in [site], and every line that uses an address
 * left empty dropped. A name that isn't one of the addresses is left as it is (docs.test.ts finds any).
 */
export function fillAddresses(text: string, site: SiteUrls): string {
	const values = placeholders(site);
	const known = (name: string) => Object.hasOwn(values, name);
	return text
		.split('\n')
		.filter(line => ![...line.matchAll(/\{\{(\w+)\}\}/g)].some(([, name]) => known(name) && !values[name]))
		.map(line => line.replaceAll(/\{\{(\w+)\}\}/g, (whole, name: string) => (known(name) ? values[name] : whole)))
		.join('\n');
}

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
	.map(([path, text]) => parsePage(path.replace(/^\.\/|\.md$/g, ''), fillAddresses(text, SITE)))
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

const escapeAttr = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** The width and height of the docs picture at [href], from image-sizes.json, if it's one of them. */
export function imageSize(href: string): readonly [number, number] | undefined {
	const m = /^\/app\/docs-images\/([^/?#]+)$/.exec(href);
	const size: number[] | undefined = m ? (IMAGE_SIZES as Record<string, number[]>)[m[1]] : undefined;
	return size?.length === 2 ? [size[0], size[1]] : undefined;
}

/**
 * A picture as an <img> that keeps its place before it loads (its width and height, so the page doesn't jump as
 * each one arrives) and is decoded off the main thread. All but the page's first wait until they're near the screen.
 */
function picture({ href, title, text }: Tokens.Image, first: boolean): string {
	const size = imageSize(href);
	const attrs = [
		`src="${escapeAttr(href)}"`,
		`alt="${escapeAttr(text)}"`,
		title ? `title="${escapeAttr(title)}"` : '',
		size ? `width="${size[0]}" height="${size[1]}"` : '',
		first ? '' : 'loading="lazy"',
		'decoding="async"'
	];
	return `<img ${attrs.filter(Boolean).join(' ')}>`;
}

/** A page's markdown as HTML. The pages are Daidal's own, so nothing in them needs sanitising. */
export function render(body: string): string {
	let pictures = 0;
	const marked = new Marked({ gfm: true, renderer: { image: token => picture(token, pictures++ === 0) } });
	return marked.parse(body, { async: false });
}
