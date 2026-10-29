import { describe, expect, it } from 'vitest';
import { formatLastSetsCompact, formatPrBadge, progressionBadge } from './progression';
import type { SetEntry } from './types';

function sets(rows: Array<[number, number]>): SetEntry[] {
  return rows.map(([weight, reps], index) => ({
    id: String(index),
    sessionId: 's1',
    programExerciseId: 'ex1',
    weight,
    reps,
    sortOrder: index,
    createdAt: '2026-10-22T10:00:00.000Z',
  }));
}

describe('progressionBadge', () => {
  it('suggests +2.5 kg when all sets hit top reps at one weight', () => {
    const badge = progressionBadge(sets([[70, 8], [70, 8], [70, 8]]));
    expect(badge?.kind).toBe('earn-weight');
    expect(badge?.label).toContain('try +2.5 kg');
    if (badge?.kind === 'earn-weight') {
      expect(badge.suggestedWeight).toBe(72.5);
    }
  });

  it('nudges extra reps when the last set fell short', () => {
    const badge = progressionBadge(sets([[80, 8], [80, 8], [80, 7]]));
    expect(badge?.kind).toBe('add-reps');
    expect(badge?.label).toContain('+1 rep');
  });

  it('formats last session compact list', () => {
    expect(formatLastSetsCompact(sets([[80, 8], [80, 8], [80, 7]]))).toBe('80×8, 80×8, 80×7');
  });

  it('formats PR badge from heaviest', () => {
    expect(formatPrBadge({ weight: 85, reps: 5 })).toBe('🏆 PR 85kg × 5');
  });
});
