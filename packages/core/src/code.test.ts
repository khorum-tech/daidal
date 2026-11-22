import { describe, expect, it } from 'vitest';
import { functionsInText, paramsText, parseParams, parseSignature, signature, splitTopLevel, toFunction, toFunctions } from './code';

describe('functions', () => {
	it('reads a signature into a name, its parameters and what it returns', () => {
		expect(parseSignature('check(batch: Batch): Verdict')).toEqual({ name: 'check', params: [{ name: 'batch', type: 'Batch' }], returns: 'Verdict' });
		expect(parseSignature('reset()')).toEqual({ name: 'reset' });
		expect(parseSignature('- load(id, strict?: Boolean) -> Order')).toEqual({ name: 'load', params: [{ name: 'id' }, { name: 'strict?', type: 'Boolean' }], returns: 'Order' });
		expect(parseSignature('sum(lines: Map<Currency, Money>, by: (a, b) => c): Map<Currency, Money>')).toEqual({
			name: 'sum',
			params: [
				{ name: 'lines', type: 'Map<Currency, Money>' },
				{ name: 'by', type: '(a, b) => c' }
			],
			returns: 'Map<Currency, Money>'
		});
	});

	it("doesn't take prose, fields or half a signature for one", () => {
		for (const text of ['id: uuid', 'Call init() first', 'check(batch', 'check(batch) and more', '(x) => y', '']) expect(parseSignature(text), text).toBeNull();
	});

	it('splits at its own commas only', () => {
		expect(splitTopLevel('a: A, b: Map<K, V>, c: [x, y], ')).toEqual(['a: A', 'b: Map<K, V>', 'c: [x, y]']);
		expect(parseParams('')).toEqual([]);
	});

	it('writes a function back as one line, as it reads', () => {
		const f = { name: 'check', params: [{ name: 'batch', type: 'Batch' }, { name: 'strict' }], returns: 'Verdict' };
		expect(signature(f)).toBe('check(batch: Batch, strict): Verdict');
		expect(paramsText(f.params)).toBe('batch: Batch, strict');
		expect(parseSignature(signature(f))).toEqual(f);
		expect(signature({ name: 'reset' })).toBe('reset()');
	});

	it('cleans what a document or config gives: entries, signatures, params as one line; nameless ones go', () => {
		expect(toFunction({ name: ' check ', params: 'batch: Batch', returns: ' Verdict ', notes: ' Rejects it. ', extra: 1 })).toEqual({ name: 'check', params: [{ name: 'batch', type: 'Batch' }], returns: 'Verdict', notes: 'Rejects it.' });
		expect(toFunction({ name: 'f', params: ['a: A', { name: 'b', type: 'B' }, { type: 'nameless' }, 7] })).toEqual({ name: 'f', params: [{ name: 'a', type: 'A' }, { name: 'b', type: 'B' }] });
		expect(toFunction('not a signature')).toEqual({ name: 'not a signature' });
		expect(toFunctions(['reset()', { name: '' }, null, 3, { params: [] }])).toEqual([{ name: 'reset' }]);
		expect(toFunctions('reset()')).toEqual([{ name: 'reset' }]);
		expect(toFunctions(undefined)).toEqual([]);
	});

	it('finds functions a code box wrote as text, and leaves the rest where it was', () => {
		const found = functionsInText({ members: ['id: uuid', 'check(batch): Verdict'], subtitle: 'reset()\nKeeps the books', notes: 'Call check() first.\n• explain(batch): List<Imbalance>' });
		expect(found.found.map(signature)).toEqual(['check(batch): Verdict', 'reset()', 'explain(batch): List<Imbalance>']);
		expect(found).toMatchObject({ members: ['id: uuid'], subtitle: 'Keeps the books', notes: 'Call check() first.' });
		expect(functionsInText({}).found).toEqual([]);
	});
});
