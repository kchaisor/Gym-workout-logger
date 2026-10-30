import type { SetEntry } from './types';

export function stepStickyWeight(weight: number, delta: number): number {
  return Math.max(0, Math.round((weight + delta) * 2) / 2);
}

export function stepStickyReps(reps: number, delta: number): number {
  return Math.max(0, reps + delta);
}

/** Values shown in the current (unlogged) row — driven by sticky draft, not last-session targets. */
export function currentRowDraftValues(
  rowIndex: number,
  lastSets: SetEntry[],
  sticky: { weight: number; reps: number },
): { weight: number; reps: number; lastLabel: string | null } {
  const last = lastSets[rowIndex] ?? null;
  return {
    weight: sticky.weight,
    reps: sticky.reps,
    lastLabel: last ? `${last.weight} kg × ${last.reps}` : null,
  };
}

export function removeSetEntry(entries: SetEntry[], id: string): SetEntry[] {
  return entries.filter((set) => set.id !== id);
}

/** Undo closes inline edit without mutating logged sets. */
export function clearSetEdit(): null {
  return null;
}
