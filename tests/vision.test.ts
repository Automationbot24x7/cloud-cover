import { describe, it, expect } from 'vitest';
import { sampleSegment, sightLine, computeCoverage } from '../src/core/vision';
import { distance, EPS } from '../src/core/geom';

describe('vision', () => {
  describe('sampleSegment', () => {
    it('returns endpoints', () => {
      const points = sampleSegment({ x: 0, y: 0 }, { x: 10, y: 10 }, 3);
      expect(points[0]).toEqual({ x: 0, y: 0 });
      expect(points[points.length - 1]).toEqual({ x: 10, y: 10 });
    });

    it('returns the correct count', () => {
      const points = sampleSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
      expect(points).toHaveLength(5);
    });

    it('treats count below 2 as 2', () => {
      const points = sampleSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
      expect(points).toHaveLength(2);
    });
  });

  describe('sightLine', () => {
    it('returns open when nothing blocks', () => {
      const line = sightLine({ x: 0, y: 0 }, { x: 10, y: 0 }, [], []);
      expect(line.state).toBe('open');
      expect(line.end).toEqual({ x: 10, y: 0 });
    });

    it('returns wall when a wall blocks the line', () => {
      const walls = [
        { a: { x: 5, y: -5 }, b: { x: 5, y: 5 } },
      ];
      const line = sightLine({ x: 0, y: 0 }, { x: 10, y: 0 }, walls, []);
      expect(line.state).toBe('wall');
    });

    it('returns cloud when a cloud blocks the line', () => {
      const clouds = [
        { center: { x: 5, y: 0 }, radius: 2 },
      ];
      const line = sightLine({ x: 0, y: 0 }, { x: 10, y: 0 }, [], clouds);
      expect(line.state).toBe('cloud');
      // End should be the cloud entry point
      expect(distance(line.end, { x: 3, y: 0 })).toBeLessThan(EPS * 100);
    });

    it('returns wall when a cloud is in front of a wall, with end at cloud entry', () => {
      const walls = [
        { a: { x: 8, y: -5 }, b: { x: 8, y: 5 } },
      ];
      const clouds = [
        { center: { x: 4, y: 0 }, radius: 1 },
      ];
      const line = sightLine({ x: 0, y: 0 }, { x: 10, y: 0 }, walls, clouds);
      expect(line.state).toBe('wall');
      // End should be the cloud entry point (closer than wall)
      expect(distance(line.end, { x: 3, y: 0 })).toBeLessThan(EPS * 100);
    });
  });

  describe('computeCoverage', () => {
    it('computes ratio for a mixed case', () => {
      const watchers = [{ x: 0, y: 0 }];
      const samples = [
        { x: 10, y: 0 },
        { x: 10, y: 20 },
      ];
      const walls: import('../src/core/types').Segment[] = [];
      const clouds = [
        { center: { x: 10, y: 0 }, radius: 2 },
      ];
      const coverage = computeCoverage(watchers, samples, walls, clouds);
      // Sample at (10,0) is at cloud center -> cloud
      // Sample at (10,20) — line from (0,0) to (10,20) does not pass through cloud -> open
      expect(coverage.cloud).toBe(1);
      expect(coverage.open).toBe(1);
      expect(coverage.ratio).toBeCloseTo(0.5);
    });

    it('returns ratio 1 when nothing is dangerous (all walls)', () => {
      const watchers = [{ x: 0, y: 0 }];
      const samples = [
        { x: 10, y: 0 },
      ];
      const walls = [
        { a: { x: 5, y: -5 }, b: { x: 5, y: 5 } },
      ];
      const clouds: import('../src/core/types').Cloud[] = [];
      const coverage = computeCoverage(watchers, samples, walls, clouds);
      expect(coverage.wall).toBe(1);
      expect(coverage.cloud).toBe(0);
      expect(coverage.open).toBe(0);
      expect(coverage.ratio).toBe(1);
    });
  });
});
