import type { RNG } from '../types';

/**
 * mulberry32 — tiny, fast, deterministic 32-bit PRNG.
 * Same seed ⇒ same sequence, which is what makes workbooks reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a seeded RNG implementing the shared `RNG` interface. */
export function createRng(seed: number): RNG {
  const next = mulberry32(seed);
  return {
    next,
    nextRange(min: number, max: number): number {
      return min + (max - min) * next();
    },
  };
}

/** A fresh random seed for "New variant". */
export function randomSeed(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}
