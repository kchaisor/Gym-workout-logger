import { formatSet, trimNum } from './ids';
import type { HeaviestSet, SetEntry } from './types';

export type ProgressionBadge =
  | { kind: 'earn-weight'; label: string; suggestedWeight: number }
  | { kind: 'add-reps'; label: string }
  | { kind: 'match'; label: string };

const WEIGHT_STEP_KG = 2.5;

/** Compact set list for subtitles, e.g. 80×8, 80×8, 80×7 */
export function formatLastSetsCompact(sets: SetEntry[]): string {
  return sets.map((set) => `${trimNum(set.weight)}×${set.reps}`).join(', ');
}

/** PR pill label from lifetime heaviest. */
export function formatPrBadge(heaviest: HeaviestSet | null): string | null {
  if (!heaviest) return null;
  return `🏆 PR ${trimNum(heaviest.weight)}kg × ${heaviest.reps}`;
}

/**
 * Double-progression hint from the last session's sets at a working weight.
 * When every set hit the top rep target, suggest +2.5 kg; otherwise nudge extra reps.
 */
export function progressionBadge(lastSets: SetEntry[]): ProgressionBadge | null {
  if (lastSets.length === 0) return null;

  const workingWeight = lastSets[0].weight;
  const sameWeight = lastSets.every((set) => set.weight === workingWeight);
  if (!sameWeight) return null;

  const targetReps = Math.max(...lastSets.map((set) => set.reps));
  const minReps = Math.min(...lastSets.map((set) => set.reps));
  const setCount = lastSets.length;

  if (lastSets.every((set) => set.reps >= targetReps)) {
    const suggested = workingWeight + WEIGHT_STEP_KG;
    return {
      kind: 'earn-weight',
      label: `try +${WEIGHT_STEP_KG} kg → ${trimNum(suggested)}kg`,
      suggestedWeight: suggested,
    };
  }

  if (minReps < targetReps) {
    const gap = targetReps - minReps;
    return {
      kind: 'add-reps',
      label: `Target: ${setCount}×${targetReps} @ ${trimNum(workingWeight)}kg (+${gap} rep${gap === 1 ? '' : 's'})`,
    };
  }

  return {
    kind: 'match',
    label: `Match ${trimNum(workingWeight)}kg · +1 rep`,
  };
}

export function formatSetCompact(weight: number, reps: number): string {
  return `${trimNum(weight)}×${reps}`;
}

export function formatSetGlance(weight: number, reps: number): string {
  return formatSet(weight, reps);
}
