import { describe, expect, it } from 'vitest';
import { parseYaml, yamlLines, yamlScalar, YamlError } from './yaml';
import { SAMPLE } from '../fixtures/docs';

describe('yaml', () => {
	it('writes plain words bare and quotes the rest', () => {
		expect(yamlScalar('Orders DB')).toBe('Orders DB');
		expect(yamlScalar('yes')).toBe('"yes"');
		expect(yamlScalar('a: b')).toBe('"a: b"');
		expect(yamlScalar('')).toBe('""');
		expect(yamlScalar(1.4)).toBe('1.4');
		expect(yamlScalar(null)).toBe('null');
	});

	it('reads back what it writes, a whole diagram included', () => {
		const text = yamlLines(SAMPLE as unknown as Record<string, unknown>).join('\n');
		expect(parseYaml(text)).toEqual(JSON.parse(JSON.stringify(SAMPLE)));
	});

	it('folds long text and reads it back as one line', () => {
		const notes = 'A very long note that goes on well past the sixty-eight characters a line may hold before it folds.';
		const lines = yamlLines({ notes });
		expect(lines[0]).toBe('notes: >-');
		expect(parseYaml(lines.join('\n'))).toEqual({ notes });
	});

	it('reads flow lists and maps, comments, and numbers', () => {
		expect(parseYaml('# a comment\ntags: [web, data]\nlayout: { x: 10, y: -2.5 }\nok: yes')).toEqual({ tags: ['web', 'data'], layout: { x: 10, y: -2.5 }, ok: true });
	});

	it('says which line it could not read', () => {
		const err = (() => {
			try {
				parseYaml('nodes:\n  - id: a\n  name oops');
			} catch (e) {
				return e as YamlError;
			}
		})();
		expect(err).toBeInstanceOf(YamlError);
		expect(err!.line).toBe(3);
	});
});
