// Builds app/src/lib/diagram/icon-library.json: the icons Skope can draw, from Phosphor (MIT, 256 × 256 grid,
// regular weight). To add an icon, put its Phosphor name in ICONS below and run `node scripts/icons.mjs`; browse
// the names at https://phosphoricons.com. The icon is stored under the camelCase of that name (plugs-connected →
// plugsConnected).
//
// Entries marked "from": "prototype" came across from web/index.html and are kept exactly as they are, so the
// app's own chrome and older types don't change. Those marked "ui" are the app's own controls and aren't offered
// for nodes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icons as catalogue } from '@phosphor-icons/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'app/src/lib/diagram/icon-library.json');
const ASSETS = join(ROOT, 'node_modules/@phosphor-icons/core/assets/regular');

/** Phosphor names to include, roughly by what they draw. */
const ICONS = `
	robot brain plugs-connected plugs cube-focus sparkle magic-wand chat-circle-text chats shield-check shield exam
	chart-bar chart-line chart-pie-slice gauge terminal-window terminal device-mobile device-tablet desktop laptop
	monitor watch app-window browsers puzzle-piece cloud cloud-arrow-down cloud-arrow-up cloud-check signpost
	arrows-split arrows-merge webhooks-logo git-branch git-merge git-pull-request git-commit package archive
	box-arrow-down shipping-container cpu memory circuitry hard-drive database table rows columns funnel
	funnel-simple file file-text file-code files folder-open folders binoculars eye bell bell-ringing envelope
	envelope-simple paper-plane-tilt chat-text phone broadcast rss wifi-high cell-signal-full network share-network
	graph tree-structure path arrows-left-right arrows-clockwise repeat timer clock calendar hourglass key password
	fingerprint identification-card user-circle users-three user-gear lock-key shield-warning warning bug
	bug-beetle siren megaphone toggle-left toggle-right sliders gear gear-six wrench hammer code-block
	brackets-curly function stack-simple kanban list-checks check-square credit-card bank currency-dollar receipt
	shopping-cart storefront buildings house map-pin globe-hemisphere-west translate image video-camera microphone
	speaker-high play-circle headphones printer qr-code barcode lightbulb fire flask atom infinity scales flag
	target crown star heart globe-simple lock-simple-open vault cards cursor-click hand-pointing link link-break
	magnifying-glass-plus newspaper book-open notebook article clipboard-text notepad tag waves
`
	.split(/\s+/)
	.filter(Boolean);

const camel = name => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const words = name => name.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

const current = JSON.parse(readFileSync(OUT, 'utf8'));
const kept = Object.fromEntries(Object.entries(current).filter(([, icon]) => icon.from === 'prototype'));
const meta = new Map(catalogue.map(i => [i.name, i]));

const library = { ...kept };
const missing = [];
for (const name of ICONS) {
	const key = camel(name);
	if (kept[key]) continue;
	const info = meta.get(name);
	if (!info) {
		missing.push(name);
		continue;
	}
	const svg = readFileSync(join(ASSETS, `${name}.svg`), 'utf8');
	const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1]);
	if (paths.length !== 1 || /<(circle|rect|line|polyline|polygon|ellipse)\b/.test(svg)) {
		missing.push(`${name} (not a single path)`);
		continue;
	}
	library[key] = { path: paths[0], label: words(name), keywords: info.tags.filter(t => !t.startsWith('*')) };
}
if (missing.length) {
	console.error(`Not added: ${missing.join(', ')}`);
	process.exitCode = 1;
}

const sorted = Object.fromEntries(Object.entries(library).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, `${JSON.stringify(sorted, null, '\t')}\n`);
console.log(`${Object.keys(sorted).length} icons → ${OUT}`);
