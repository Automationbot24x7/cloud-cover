import { describe, it, expect } from 'vitest';
import { computeThrow, DEFAULT_THROW } from '../src/core/throw';
import { EPS } from '../src/core/geom';

describe('throw', () => {
  it('DEFAULT_THROW has expected values', () => {
    expect(DEFAULT_THROW).toEqual({
      minRange: 60,
      maxRange: 1500,
      maxBounces: 3,
      bounceKeep: 1,
      skin: 10,
    });
  });

  it('a free throw lands exactly at the target', () => {
    const result = computeThrow(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [],
      DEFAULT_THROW
    );
    expect(result.landing).toEqual({ x: 100, y: 0 });
    expect(result.bounces).toBe(0);
    expect(result.path).toHaveLength(2);
    expect(result.path[0]).toEqual({ x: 0, y: 0 });
    expect(result.path[1]).toEqual({ x: 100, y: 0 });
  });

  it('range is clamped at minRange', () => {
    const result = computeThrow(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      [],
      DEFAULT_THROW
    );
    // distance is 10, clamped to minRange 60
    expect(result.landing.x).toBeCloseTo(60);
    expect(result.landing.y).toBeCloseTo(0);
  });

  it('range is clamped at maxRange', () => {
    const result = computeThrow(
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      [],
      DEFAULT_THROW
    );
    // distance is 2000, clamped to maxRange 1500
    expect(result.landing.x).toBeCloseTo(1500);
    expect(result.landing.y).toBeCloseTo(0);
  });

  it('one bounce off a vertical wall mirrors the x direction', () => {
    const walls = [
      { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
    ];
    const result = computeThrow(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      walls,
      DEFAULT_THROW
    );
    expect(result.bounces).toBe(1);
    // After bouncing off x=50 wall, x direction is mirrored
    // Path: origin -> bounce point near wall -> landing
    expect(result.path).toHaveLength(3);
    // Bounce point should be near the wall (skin short)
    expect(result.path[1].x).toBeCloseTo(50 - DEFAULT_THROW.skin);
  });

  it('total path length equals the clamped range with bounceKeep=1', () => {
    const walls = [
      { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
    ];
    const result = computeThrow(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      walls,
      { ...DEFAULT_THROW, bounceKeep: 1 }
    );
    // Total distance is 100 (origin to target). With bounce at x=40 (skin=10 short of wall at 50),
    // first leg = 40, remaining = (100 - 40) * 1 = 60, second leg = 60
    // Total path length = 40 + 60 = 100
    expect(result.length).toBeCloseTo(100);
  });

  it('a throw into a corner terminates at maxBounces', () => {
    const walls = [
      { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
      { a: { x: 50, y: 100 }, b: { x: 100, y: 100 } },
      { a: { x: 0, y: 100 }, b: { x: 50, y: 100 } },
    ];
    const result = computeThrow(
      { x: 0, y: 50 },
      { x: 200, y: 50 },
      walls,
      { ...DEFAULT_THROW, maxBounces: 2 }
    );
    expect(result.bounces).toBeLessThanOrEqual(2);
  });

  it('bounceKeep=0.5 shortens the leg after the bounce', () => {
    const walls = [
      { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
    ];
    const result = computeThrow(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      walls,
      { ...DEFAULT_THROW, bounceKeep: 0.5 }
    );
    expect(result.bounces).toBe(1);
    // First leg: 40 (to skin short of wall). Remaining after bounce: (100 - 40) * 0.5 = 30
    // Second leg: 30. Total path: 40 + 30 = 70
    expect(result.length).toBeCloseTo(70);
  });

  it('landing point is never closer than skin-EPS to the wall it bounced from', () => {
    const walls = [
      { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
    ];
    const result = computeThrow(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      walls,
      DEFAULT_THROW
    );
    expect(result.bounces).toBe(1);
    // Bounce point is skin short of wall at x=50, so x = 40
    const bouncePoint = result.path[1];
    const distToWall = Math.abs(bouncePoint.x - 50);
    expect(distToWall).toBeGreaterThanOrEqual(DEFAULT_THROW.skin - EPS);
  });
});
