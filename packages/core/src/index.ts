/**
 * The published entry point: what an integration needs to turn a Daidal config into a picture, plus the pieces
 * underneath for anyone who wants to work with the scene. The browser bundle (dist/daidal-core.js, built by
 * scripts/build-core.mjs) is this module and everything it imports, as one ES module with no dependencies, so a
 * page, a Worker or Claude's inline visuals can load it from an npm CDN.
 *
 * Inside this repository the app and the Worker keep importing modules by path ('…/daidal-core/model'); this entry
 * adds nothing they need.
 */
import { readConfig } from './config';
import { tagsOn, toScene } from './model';
import { toSvg, type RenderOptions } from './render';
import type { DaidalDoc } from './types';

export interface RenderConfigOptions extends Partial<RenderOptions> {
	/** A saved view to show, by name. With none, every tag is on. */
	view?: string;
}

export interface Rendered {
	svg: string;
	width: number;
	height: number;
	/** The document the config read into, for anyone who wants to keep it. */
	doc: DaidalDoc;
}

/**
 * A Daidal config, YAML or JSON, drawn as a standalone SVG. Throws a ConfigError, with a line for YAML, when the
 * config can't be read or doesn't hold together.
 */
export function renderConfig(text: string, { view, on, ghosted, edgeStyle }: RenderConfigOptions = {}): Rendered {
	const { doc } = readConfig(text, { version: 1 }, 'replace');
	return { ...renderDoc(doc, { view, on, ghosted, edgeStyle }), doc };
}

/** A Daidal document drawn as a standalone SVG. */
export function renderDoc(doc: DaidalDoc, { view, on, ghosted, edgeStyle }: RenderConfigOptions = {}): Omit<Rendered, 'doc'> {
	const scene = toScene(doc);
	const chosen = view ?? scene.initialView ?? null;
	return toSvg(scene, { on: on ?? tagsOn(scene, chosen), ghosted, edgeStyle });
}

export { readConfig, configText, langOf, ConfigError, type ConfigLang, type ReadConfig } from './config';
export { toScene, tagsOn, bounds, type Scene, type SceneNode, type SceneEdge, type SceneBoundary, type SceneTag, type SceneView } from './model';
export { toSvg, type RenderOptions } from './render';
export { parseYaml, YamlError } from './yaml';
export type { DaidalDoc, DocNode, DocEdge, DocBoundary, DocTag, NodeLink, CustomType } from './types';
