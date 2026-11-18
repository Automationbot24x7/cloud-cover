import { describe, it, expect } from 'vitest';
import {
  vec,
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  distance,
  lerp,
  normalize,
  reflect,
  polygonToSegments,
  raycast,
  segmentCircleEntry,
} from '../src/core/geom';

describe('geom', () => {
  describe('vec', () => {
    it('creates a vector', () => {
      const v = vec(3, 4);
      expect(v).toEqual({ x: 3, y: 4 });
    });
  });

  describe('add', () => {
    it('adds two vectors', () => {
      expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    });
  });

  describe('sub', () => {
    it('subtracts two vectors', () => {
      expect(sub({ x: 5, y: 6 }, { x: 3, y: 4 })).toEqual({ x: 2, y: 2 });
    });
  });

  describe('scale', () => {
    it('scales a vector', () => {
      expect(scale({ x: 2, y: 3 }, 4)).toEqual({ x: 8, y: 12 });
    });
  });

  describe('dot', () => {
    it('computes dot product', () => {
      expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    });
  });

  describe('cross', () => {
    it('computes 2D cross product (z component)', () => {
      expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
      expect(cross({ x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1);
    });
  });

  describe('length', () => {
    it('returns the length of a vector', () => {
      expect(length({ x: 3, y: 4 })).toBe(5);
    });
  });

  describe('distance', () => {
    it('returns the distance between two vectors', () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });
  });

  describe('lerp', () => {
    it('interpolates between two vectors', () => {
      expect(lerp({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.5)).toEqual({ x: 5, y: 5 });
    });
  });

  describe('normalize', () => {
    it('returns a unit vector', () => {
      const n = normalize({ x: 3, y: 4 });
      expect(length(n)).toBeCloseTo(1);
    });

    it('returns zero vector for a zero input', () => {
      const n = normalize({ x: 0, y: 0 });
      expect(n).toEqual({ x: 0, y: 0 });
    });
  });

  describe('reflect', () => {
    it('reflects off a horizontal normal', () => {
      // Reflect (1, 2) about normal (0, 1) — should flip y
      const result = reflect({ x: 1, y: 2 }, { x: 0, y: 1 });
      expect(result).toEqual({ x: 1, y: -2 });
    });

    it('reflects off a 45-degree normal', () => {
      // Reflect (1, 0) about normal (1/√2, 1/√2) — should give (0, -1)
      const s = Math.SQRT1_2;
      const result = reflect({ x: 1, y: 0 }, { x: s, y: s });
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(-1);
    });
  });

  describe('polygonToSegments', () => {
    it('creates a closed polygon outline', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ];
      const segments = polygonToSegments(points);
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
      expect(segments[2]).toEqual({ a: { x: 1, y: 1 }, b: { x: 0, y: 0 } });
    });
  });

  describe('raycast', () => {
    it('picks the nearest of two walls', () => {
      const walls = [
        { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } },
        { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } },
      ];
      const hit = raycast({ x: 0, y: 5 }, { x: 1, y: 0 }, 20, walls);
      expect(hit).not.toBeNull();
      expect(hit!.distance).toBeCloseTo(5);
    });

    it('misses a wall behind the origin', () => {
      const walls = [
        { a: { x: -5, y: 0 }, b: { x: -5, y: 10 } },
      ];
      const hit = raycast({ x: 0, y: 5 }, { x: 1, y: 0 }, 20, walls);
      expect(hit).toBeNull();
    });

    it('ignores a parallel wall', () => {
      const walls = [
        { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } },
      ];
      const hit = raycast({ x: 0, y: 5 }, { x: 1, y: 0 }, 20, walls);
      expect(hit).toBeNull();
    });

    it('respects maxDistance', () => {
      const walls = [
        { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } },
      ];
      const hit = raycast({ x: 0, y: 5 }, { x: 1, y: 0 }, 5, walls);
      expect(hit).toBeNull();
    });

    it('returns a normal facing the origin from both sides of the same wall', () => {
      const wall = { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } };
      // From left side
      const hit1 = raycast({ x: 0, y: 5 }, { x: 1, y: 0 }, 10, [wall]);
      expect(hit1).not.toBeNull();
      expect(hit1!.normal.x).toBeCloseTo(-1);

      // From right side
      const hit2 = raycast({ x: 10, y: 5 }, { x: -1, y: 0 }, 10, [wall]);
      expect(hit2).not.toBeNull();
      expect(hit2!.normal.x).toBeCloseTo(1);
    });
  });

  describe('segmentCircleEntry', () => {
    it('returns null when the segment misses the circle', () => {
      const result = segmentCircleEntry(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
        2
      );
      expect(result).toBeNull();
    });

    it('returns the graze point when the segment touches the circle edge', () => {
      const result = segmentCircleEntry(
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        5
      );
      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(0);
      expect(result!.y).toBeCloseTo(5);
    });

    it('returns the entry point for a pass-through', () => {
      const result = segmentCircleEntry(
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        2
      );
      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(3);
      expect(result!.y).toBeCloseTo(5);
    });

    it('returns a when a is already inside the circle', () => {
      const result = segmentCircleEntry(
        { x: 5, y: 5 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        3
      );
      expect(result).toEqual({ x: 5, y: 5 });
    });
  });
});
