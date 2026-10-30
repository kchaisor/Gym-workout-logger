import { describe, expect, it } from 'vitest';
import {
  clearSetEdit,
  currentRowDraftValues,
  removeSetEntry,
  restoreSetEntry,
  stepStickyReps,
  stepStickyWeight,
} from './logControls';
import type { SetEntry } from './types';

describe('stepStickyWeight', () => {
  it('steps by 2.5 and rounds to nearest 0.5', () => {
    expect(stepStickyWeight(80, 2.5)).toBe(82.5);
    expect(stepStickyWeight(82.5, 2.5)).toBe(85);
    expect(stepStickyWeight(80, -2.5)).toBe(77.5);
  });

  it('does not go below zero', () => {
    expect(stepStickyWeight(2.5, -5)).toBe(0);
  });
});

describe('stepStickyReps', () => {
  it('increments and decrements reps', () => {
    expect(stepStickyReps(8, 1)).toBe(9);
    expect(stepStickyReps(8, -1)).toBe(7);
  });

  it('does not go below zero', () => {
    expect(stepStickyReps(0, -1)).toBe(0);
  });
});

describe('currentRowDraftValues', () => {
  const lastSets: SetEntry[] = [
    {
      id: 'a',
      sessionId: 's',
      programExerciseId: 'ex',
      weight: 80,
      reps: 8,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('uses sticky for kg and reps on the active row', () => {
    const row = currentRowDraftValues(0, lastSets, { weight: 82.5, reps: 10 });
    expect(row.weight).toBe(82.5);
    expect(row.reps).toBe(10);
    expect(row.lastLabel).toBe('80 kg × 8');
  });
});

describe('clearSetEdit (undo)', () => {
  it('returns null so edit mode closes without deleting', () => {
    expect(clearSetEdit()).toBeNull();
  });
});

describe('restoreSetEntry (delete undo)', () => {
  it('restores id, order, weight, reps and timestamp', () => {
    const removed: SetEntry = {
      id: 'drop',
      sessionId: 's',
      programExerciseId: 'ex',
      weight: 82.5,
      reps: 6,
      sortOrder: 1,
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    const entries: SetEntry[] = [
      {
        id: 'keep',
        sessionId: 's',
        programExerciseId: 'ex',
        weight: 60,
        reps: 5,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const restored = restoreSetEntry(entries, removed);
    expect(restored).toHaveLength(2);
    expect(restored.map((e) => e.id)).toEqual(['keep', 'drop']);
    expect(restored[1]).toEqual(removed);
  });

  it('does not duplicate an existing id', () => {
    const entry: SetEntry = {
      id: 'keep',
      sessionId: 's',
      programExerciseId: 'ex',
      weight: 60,
      reps: 5,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(restoreSetEntry([entry], entry)).toEqual([entry]);
  });
});

describe('removeSetEntry', () => {
  it('removes one set by id', () => {
    const entries: SetEntry[] = [
      {
        id: 'keep',
        sessionId: 's',
        programExerciseId: 'ex',
        weight: 60,
        reps: 5,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'drop',
        sessionId: 's',
        programExerciseId: 'ex',
        weight: 60,
        reps: 5,
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(removeSetEntry(entries, 'drop').map((e) => e.id)).toEqual(['keep']);
  });
});
