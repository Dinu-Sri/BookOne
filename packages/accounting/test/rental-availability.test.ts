import { describe, expect, it } from 'vitest';
import { availableQty, datesOverlap, padHireTo } from '../src/rental-availability';

describe('rental date overlap', () => {
  it('detects overlapping Saturday events', () => {
    expect(datesOverlap('2026-09-12', '2026-09-12', '2026-09-12', '2026-09-13')).toBe(true);
  });

  it('allows back-to-back days without padding', () => {
    expect(datesOverlap('2026-09-12', '2026-09-12', '2026-09-13', '2026-09-13')).toBe(false);
  });

  it('padding on the first booking blocks the next morning', () => {
    const padded = padHireTo('2026-09-12', 12);
    expect(padded).toBe('2026-09-13');
    expect(datesOverlap('2026-09-12', padded, '2026-09-13', '2026-09-13')).toBe(true);
  });

  it('available qty subtracts repair and committed', () => {
    expect(availableQty({ ownedQty: 200, repairQty: 10, committedQty: 150 })).toBe(40);
  });
});
