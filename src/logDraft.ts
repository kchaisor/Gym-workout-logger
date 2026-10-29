import type { LogDraft, SetEntry } from './types';

export const emptyLogDraft = (): LogDraft => ({
  sessionId: null,
  stickyByExercise: {},
  extraSetRows: {},
  restTimer: null,
});

/** Reset draft when the open session changes; keep structure for a new session. */
export function logDraftForSession(current: LogDraft | undefined, sessionId: string | null): LogDraft {
  const base = current ?? emptyLogDraft();
  if (sessionId === base.sessionId) return base;
  return {
    sessionId,
    stickyByExercise: {},
    extraSetRows: {},
    restTimer: null,
  };
}

export function stickyForExercise(
  draft: LogDraft,
  exerciseId: string,
  fallbackWeight: number,
  fallbackReps: number,
): { weight: number; reps: number } {
  const saved = draft.stickyByExercise[exerciseId];
  if (saved) return saved;
  return { weight: fallbackWeight, reps: fallbackReps };
}

export function setStickyForExercise(
  draft: LogDraft,
  exerciseId: string,
  patch: Partial<{ weight: number; reps: number }>,
): LogDraft {
  const prev = stickyForExercise(draft, exerciseId, 0, 0);
  return {
    ...draft,
    stickyByExercise: {
      ...draft.stickyByExercise,
      [exerciseId]: {
        weight: patch.weight ?? prev.weight,
        reps: patch.reps ?? prev.reps,
      },
    },
  };
}

export function rowCountForExercise(
  draft: LogDraft,
  exerciseId: string,
  lastSessionSetCount: number,
  loggedCount: number,
): number {
  const extra = draft.extraSetRows[exerciseId] ?? 0;
  const fromLast = Math.max(lastSessionSetCount, 1);
  return Math.max(fromLast + extra, loggedCount, 1);
}

export function addExtraSetRow(draft: LogDraft, exerciseId: string): LogDraft {
  const extra = (draft.extraSetRows[exerciseId] ?? 0) + 1;
  return {
    ...draft,
    extraSetRows: { ...draft.extraSetRows, [exerciseId]: extra },
  };
}

export function defaultRowValues(
  rowIndex: number,
  lastSets: SetEntry[],
  sticky: { weight: number; reps: number },
): { weight: number; reps: number; lastLabel: string | null } {
  const last = lastSets[rowIndex] ?? null;
  const targetReps = last?.reps ?? sticky.reps;
  const weight = sticky.weight > 0 ? sticky.weight : (last?.weight ?? 0);
  const reps = targetReps > 0 ? targetReps : sticky.reps;
  return {
    weight,
    reps,
    lastLabel: last ? `${last.weight} kg × ${last.reps}` : null,
  };
}
