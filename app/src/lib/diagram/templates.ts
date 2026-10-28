// The prototype's templates (web/index.html, Component.templates) as version 1 documents, so a new diagram can start
// from the same ones: tags and views wired up, with example nodes to keep or leave out.
import type { SkopeDoc } from '../types';
import templates from './templates.json';

export interface Template {
	id: string;
	name: string;
	desc: string;
	doc: SkopeDoc;
}

// The data is generated from web/index.html (Component.templates) into templates.json.
export const TEMPLATES = templates as unknown as Template[];

/**
 * A new diagram's document from [template] (or a blank one), called [name]. Without [examples] it keeps the tags,
 * views and kind but starts with an empty canvas, as the prototype does by default.
 */
export function fromTemplate(name: string, template: Template | null, examples: boolean): SkopeDoc {
	if (!template) return { version: 1, diagram: { name } };
	const doc = structuredClone(template.doc);
	doc.diagram = { ...doc.diagram, name };
	if (!examples) {
		doc.nodes = [];
		doc.edges = [];
		delete doc.boundaries;
	}
	return doc;
}
