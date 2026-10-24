import { describe, expect, it } from 'vitest';
import { snapBox } from './snap';

const other = { x: 300, y: 200, w: 190, h: 88 };

describe('snapBox', () => {
	it("lines a left edge up with another node's left edge, and draws the guide", () => {
		const s = snapBox({ x: 305, y: 400, w: 190, h: 88 }, [other], 9);
		expect([s.x, s.y]).toEqual([300, 400]);
		expect(s.guides).toEqual([{ x1: 300, y1: 176, x2: 300, y2: 512 }]);
	});

	it('lines centres up too, on both axes at once', () => {
		// Centre x 395 vs 395 after the snap; middle y 244 vs 244.
		const s = snapBox({ x: 150 + 98, y: 200 + 3, w: 100, h: 88 }, [{ ...other, x: 300 - 2 }], 9);
		expect(s.guides).toHaveLength(2);
		expect(s.y).toBe(200);
	});

	it('picks the nearest line when several are in reach', () => {
		// The left edge (487) is 3 from the first node's right (490) and 1 from the second node's left (486).
		const s = snapBox({ x: 487, y: 0, w: 100, h: 50 }, [other, { x: 486, y: 600, w: 50, h: 50 }], 9);
		expect(s.x).toBe(486);
	});

	it('leaves the box where it is when nothing is close enough', () => {
		expect(snapBox({ x: 600, y: 600, w: 190, h: 88 }, [other], 9)).toEqual({ x: 600, y: 600, guides: [] });
		// A wider reach, as a finger gets, does catch it.
		expect(snapBox({ x: 312, y: 600, w: 190, h: 88 }, [other], 9).x).toBe(312);
		expect(snapBox({ x: 312, y: 600, w: 190, h: 88 }, [other], 20).x).toBe(300);
	});
});
