import { describe, expect, it } from 'vitest';
import { TYPE_CATS } from './icons';
import { commonTypes, KINDS, kindOf } from './kinds';
import { TEMPLATES } from './templates';

describe('diagram kinds', () => {
	it('reads empty, unknown or missing as freeform, and maps the older words', () => {
		for (const raw of [undefined, '', 'nonsense', 42]) expect(kindOf(raw).id).toBe('freeform');
		expect(kindOf('C4').id).toBe('c4-container');
		expect(kindOf('c4').id).toBe('c4-container');
		expect(kindOf('Infra').id).toBe('deployment');
		expect(kindOf('Freeform').id).toBe('freeform');
		expect(kindOf(' C4-Component ').id).toBe('c4-component');
	});

	it('stacks the C4 levels, each zooming into the next', () => {
		const chain: string[] = [];
		for (let k = kindOf('c4-context'); ; k = kindOf(k.child)) {
			chain.push(`${k.level}:${k.id}`);
			if (!k.child) break;
		}
		expect(chain).toEqual(['1:c4-context', '2:c4-container', '3:c4-component', '4:c4-code']);
	});

	it('only names common types the catalogue has', () => {
		const known = new Set(TYPE_CATS.flatMap(c => c.items.map(([label]) => label)));
		for (const k of KINDS) expect(commonTypes(k, t => known.has(t)), k.id).toEqual(k.common);
		// A workspace catalogue without a type just leaves it out.
		expect(commonTypes(kindOf('c4-code'), t => t !== 'Table')).toEqual(['Class', 'Function', 'File', 'Note']);
	});

	it('gives every template a kind by its id', () => {
		expect(Object.fromEntries(TEMPLATES.map(t => [t.name, t.doc.diagram?.kind]))).toEqual({
			'C4 Container': 'c4-container',
			'C4 Context': 'c4-context',
			'Deployment topology': 'deployment',
			Freeform: 'freeform'
		});
	});
});
