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
			'C4 Context': 'c4-context',
			'C4 Container': 'c4-container',
			'C4 Component': 'c4-component',
			'C4 Code': 'c4-code',
			'Deployment topology': 'deployment',
			Freeform: 'freeform'
		});
	});
});

describe('C4 notation', () => {
	it('gives each type its role at the C4 levels it draws at, and none elsewhere', async () => {
		const { c4Role } = await import('./kinds');
		expect(c4Role(kindOf('c4-context'), 'Actor')).toBe('person');
		expect(c4Role(kindOf('c4-context'), 'System')).toBe('system');
		expect(c4Role(kindOf('c4-context'), 'Payment Provider')).toBe('external');
		// A database at the context level is still a system there.
		expect(c4Role(kindOf('c4-context'), 'Database')).toBe('system');
		expect(c4Role(kindOf('c4-container'), 'Database')).toBe('store');
		expect(c4Role(kindOf('c4-container'), 'Service')).toBe('container');
		expect(c4Role(kindOf('c4-component'), 'Component')).toBe('component');
		for (const k of ['freeform', 'deployment', 'c4-code']) expect(c4Role(kindOf(k), 'Service'), k).toBeNull();
	});

	it('writes the element line, with the subtitle as the technology', async () => {
		const { c4Line } = await import('./kinds');
		expect(c4Line('container', kindOf('c4-container'), 'Kotlin · Ktor')).toBe('[Container: Kotlin · Ktor]');
		expect(c4Line('container', kindOf('c4-container'), '  ')).toBe('[Container]');
		expect(c4Line('store', kindOf('c4-container'), 'PostgreSQL')).toBe('[Container: PostgreSQL]');
		expect(c4Line('store', kindOf('c4-component'), 'Redis')).toBe('[Component: Redis]');
		expect(c4Line('person', kindOf('c4-context'), 'Reconcile')).toBe('[Person]');
		expect(c4Line('external', kindOf('c4-context'), 'Files')).toBe('[External System]');
		expect(c4Line('system', kindOf('c4-context'), 'Ledger')).toBe('[Software System]');
	});
});

describe('C4 levels, up', () => {
	it('stacks each C4 level under the one above, and nothing above Context', () => {
		expect(['c4-code', 'c4-component', 'c4-container', 'c4-context', 'freeform'].map(k => kindOf(k).parent ?? null)).toEqual(['c4-component', 'c4-container', 'c4-context', null, null]);
	});
});
