import { describe, expect, it } from 'vitest';
import { ago } from './time';

const NOW = Date.parse('2026-10-24T12:00:00Z');

describe('ago', () => {
	it.each([
		[NOW - 10_000, 'just now'],
		[NOW - 5 * 60_000, '5m ago'],
		[NOW - 3 * 3_600_000, '3h ago'],
		[NOW - 26 * 3_600_000, 'yesterday'],
		[NOW - 4 * 86_400_000, '4d ago']
	])('%s → %s', (ms, words) => {
		expect(ago(ms, NOW)).toBe(words);
	});

	it('gives a date after a week, and never reads a future time as ago', () => {
		expect(ago(NOW - 30 * 86_400_000, NOW)).toMatch(/2026/);
		expect(ago(NOW + 60_000, NOW)).toBe('just now');
	});
});
