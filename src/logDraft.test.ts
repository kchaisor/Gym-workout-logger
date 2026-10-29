import { describe, expect, it } from 'vitest';
import {
  emptyLogDraft,
  logDraftForSession,
  rowCountForExercise,
  setStickyForExercise,
  stickyForExercise,
} from './logDraft';

describe('logDraft sticky weight', () => {
  it('keeps sticky weight per exercise in the draft', () => {
    let draft = emptyLogDraft();
    draft = setStickyForExercise(draft, 'bench', { weight: 80, reps: 8 });
    expect(stickyForExercise(draft, 'bench', 0, 0)).toEqual({ weight: 80, reps: 8 });
    draft = setStickyForExercise(draft, 'bench', { weight: 82.5 });
    expect(stickyForExercise(draft, 'bench', 0, 0).weight).toBe(82.5);
  });

  it('resets draft when session id changes', () => {
    const draft = setStickyForExercise(
      logDraftForSession(emptyLogDraft(), 'session-a'),
      'bench',
      { weight: 60, reps: 10 },
    );
    const next = logDraftForSession(draft, 'session-b');
    expect(next.sessionId).toBe('session-b');
    expect(next.stickyByExercise).toEqual({});
  });

  it('row count grows with logged sets and extra rows', () => {
    const draft = { ...emptyLogDraft(), extraSetRows: { bench: 1 } };
    expect(rowCountForExercise(draft, 'bench', 3, 2)).toBe(4);
    expect(rowCountForExercise(draft, 'bench', 3, 5)).toBe(5);
  });
});
