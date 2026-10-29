import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { maybeUploadAutoBackup } from './autoBackup';
import { parseBackup, serializeBackup } from './backup';
import {
  isBackupDue,
  loggedSessionCount,
  resetBackupSchedule,
  snoozeBackupSchedule,
} from './backupPrefs';
import { isDateKey, todayLocalDateKey } from './dates';
import { loadState, saveState } from './db';
import { upsertExerciseNote } from './exerciseNotes';
import { heaviestMap } from './heaviest';
import { createId, nowIso } from './ids';
import {
  addExtraSetRow,
  emptyLogDraft,
  logDraftForSession,
  setStickyForExercise,
} from './logDraft';
import { extendRestTimer, restartRestTimer, startRestTimer } from './restTimerState';
import { DEFAULT_REST_SECONDS, normalizeRestSeconds, type RestPreset } from './restTimer';
import type {
  BackupPrefs,
  Category,
  GymState,
  HeaviestSet,
  ProgramExercise,
  RestTimerDraft,
  Session,
  SetEntry,
} from './types';

type GymStore = {
  ready: boolean;
  error: string | null;
  state: GymState | null;
  heaviest: Map<string, HeaviestSet>;
  openSession: Session | null;
  setTitle: (title: string) => Promise<void>;
  lockProgram: () => Promise<void>;
  unlockProgram: () => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  moveCategory: (id: string, direction: -1 | 1) => Promise<void>;
  addExercise: (categoryId: string, name: string) => Promise<void>;
  renameExercise: (id: string, name: string) => Promise<void>;
  removeExercise: (id: string) => Promise<void>;
  moveExercise: (id: string, direction: -1 | 1) => Promise<void>;
  startSession: (date?: string) => Promise<Session>;
  setSessionDate: (date: string) => Promise<void>;
  endSession: () => Promise<void>;
  logSet: (programExerciseId: string, weight: number, reps: number, date?: string) => Promise<void>;
  setExerciseNote: (programExerciseId: string, text: string, date?: string) => Promise<void>;
  removeSet: (id: string) => Promise<void>;
  updateSet: (id: string, patch: { weight?: number; reps?: number }) => Promise<void>;
  setStickyDraft: (
    exerciseId: string,
    patch: Partial<{ weight: number; reps: number }>,
  ) => Promise<void>;
  addDraftSetRow: (exerciseId: string) => Promise<void>;
  setRestTimerDraft: (timer: RestTimerDraft | null) => Promise<void>;
  bumpRestTimer: (presetSeconds: RestPreset | 'extend30') => Promise<void>;
  exportBackup: () => Promise<string>;
  importBackup: (raw: unknown) => Promise<void>;
  backupDue: boolean;
  dismissBackupNudge: () => Promise<void>;
  setBackupPrefs: (
    patch: Partial<
      Pick<BackupPrefs, 'remindEnabled' | 'everyDays' | 'afterSessions' | 'restSeconds'>
    >,
  ) => Promise<void>;
  swapExercise: (id: string, name: string) => Promise<void>;
};

const GymContext = createContext<GymStore | null>(null);

function sortByOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

function bumpProgram(state: GymState): GymState {
  return {
    ...state,
    program: { ...state.program, updatedAt: nowIso() },
  };
}

function assertUnlocked(state: GymState): void {
  if (state.program.locked) {
    throw new Error('Unlock the program to edit it');
  }
}

export function GymProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<GymState | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadState()
      .then((loaded) => {
        if (!cancelled) {
          setState(loaded);
          setReady(true);
          void maybeUploadAutoBackup(loaded);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onOnline = () => {
      if (state) void maybeUploadAutoBackup(state);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [state]);

  const persist = useCallback(async (next: GymState) => {
    const normalized: GymState = {
      ...next,
      exerciseNotes: next.exerciseNotes ?? [],
      logDraft: next.logDraft ?? emptyLogDraft(),
    };
    setState(normalized);
    await saveState(normalized);
  }, []);

  const syncLogDraftSession = useCallback(
    (current: GymState, sessionId: string | null): GymState => ({
      ...current,
      logDraft: logDraftForSession(current.logDraft, sessionId),
    }),
    [],
  );

  const update = useCallback(
    async (recipe: (current: GymState) => GymState) => {
      const current = state;
      if (!current) throw new Error('Not ready');
      const next = recipe(current);
      await persist(next);
      return next;
    },
    [persist, state],
  );

  const heaviest = useMemo(
    () => heaviestMap(state?.setEntries ?? []),
    [state?.setEntries],
  );

  const backupDue = useMemo(
    () => (state ? isBackupDue(state.prefs, state.setEntries) : false),
    [state],
  );

  const openSession = useMemo(() => {
    if (!state) return null;
    return (
      [...state.sessions]
        .reverse()
        .find((session) => session.programId === state.program.id && !session.endedAt) ??
      null
    );
  }, [state]);

  useEffect(() => {
    if (!state || !openSession) return;
    const draft = state.logDraft ?? emptyLogDraft();
    if (draft.sessionId === openSession.id) return;
    void persist(syncLogDraftSession(state, openSession.id));
  }, [openSession?.id, persist, state, syncLogDraftSession]);

  const setTitle = useCallback(
    async (title: string) => {
      await update((current) => {
        assertUnlocked(current);
        return bumpProgram({
          ...current,
          program: { ...current.program, title: title.trim() || current.program.title },
        });
      });
    },
    [update],
  );

  const lockProgram = useCallback(async () => {
    await update((current) => {
      if (current.categories.length === 0) {
        throw new Error('Add at least one day before locking');
      }
      if (current.programExercises.length === 0) {
        throw new Error('Add at least one exercise before locking');
      }
      return bumpProgram({
        ...current,
        program: { ...current.program, locked: true },
      });
    });
  }, [update]);

  const unlockProgram = useCallback(async () => {
    await update((current) =>
      bumpProgram({
        ...current,
        program: { ...current.program, locked: false },
      }),
    );
  }, [update]);

  const addCategory = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await update((current) => {
        assertUnlocked(current);
        const nextOrder =
          current.categories.reduce((max, cat) => Math.max(max, cat.sortOrder), -1) + 1;
        const category: Category = {
          id: createId(),
          programId: current.program.id,
          name: trimmed,
          sortOrder: nextOrder,
        };
        return bumpProgram({
          ...current,
          categories: [...current.categories, category],
        });
      });
    },
    [update],
  );

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await update((current) => {
        assertUnlocked(current);
        return bumpProgram({
          ...current,
          categories: current.categories.map((cat) =>
            cat.id === id ? { ...cat, name: trimmed } : cat,
          ),
        });
      });
    },
    [update],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      await update((current) => {
        assertUnlocked(current);
        return bumpProgram({
          ...current,
          categories: current.categories.filter((cat) => cat.id !== id),
          programExercises: current.programExercises.filter((ex) => ex.categoryId !== id),
        });
      });
    },
    [update],
  );

  const moveCategory = useCallback(
    async (id: string, direction: -1 | 1) => {
      await update((current) => {
        assertUnlocked(current);
        const ordered = sortByOrder(current.categories);
        const index = ordered.findIndex((cat) => cat.id === id);
        const swapWith = index + direction;
        if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return current;
        const a = ordered[index];
        const b = ordered[swapWith];
        return bumpProgram({
          ...current,
          categories: current.categories.map((cat) => {
            if (cat.id === a.id) return { ...cat, sortOrder: b.sortOrder };
            if (cat.id === b.id) return { ...cat, sortOrder: a.sortOrder };
            return cat;
          }),
        });
      });
    },
    [update],
  );

  const addExercise = useCallback(
    async (categoryId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await update((current) => {
        assertUnlocked(current);
        const siblings = current.programExercises.filter((ex) => ex.categoryId === categoryId);
        const nextOrder = siblings.reduce((max, ex) => Math.max(max, ex.sortOrder), -1) + 1;
        const exercise: ProgramExercise = {
          id: createId(),
          categoryId,
          name: trimmed,
          sortOrder: nextOrder,
        };
        return bumpProgram({
          ...current,
          programExercises: [...current.programExercises, exercise],
        });
      });
    },
    [update],
  );

  const renameExercise = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await update((current) => {
        assertUnlocked(current);
        return bumpProgram({
          ...current,
          programExercises: current.programExercises.map((ex) =>
            ex.id === id ? { ...ex, name: trimmed } : ex,
          ),
        });
      });
    },
    [update],
  );

  const removeExercise = useCallback(
    async (id: string) => {
      await update((current) => {
        assertUnlocked(current);
        return bumpProgram({
          ...current,
          programExercises: current.programExercises.filter((ex) => ex.id !== id),
        });
      });
    },
    [update],
  );

  const swapExercise = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await update((current) => {
        const existing = current.programExercises.find((ex) => ex.id === id && !ex.retired);
        if (!existing) return current;
        if (existing.name === trimmed) return current;
        const replacement: ProgramExercise = {
          id: createId(),
          categoryId: existing.categoryId,
          name: trimmed,
          sortOrder: existing.sortOrder,
        };
        return bumpProgram({
          ...current,
          programExercises: [
            ...current.programExercises.map((ex) =>
              ex.id === id ? { ...ex, retired: true } : ex,
            ),
            replacement,
          ],
        });
      });
    },
    [update],
  );

  const moveExercise = useCallback(
    async (id: string, direction: -1 | 1) => {
      await update((current) => {
        assertUnlocked(current);
        const target = current.programExercises.find((ex) => ex.id === id);
        if (!target) return current;
        const ordered = sortByOrder(
          current.programExercises.filter((ex) => ex.categoryId === target.categoryId),
        );
        const index = ordered.findIndex((ex) => ex.id === id);
        const swapWith = index + direction;
        if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return current;
        const a = ordered[index];
        const b = ordered[swapWith];
        return bumpProgram({
          ...current,
          programExercises: current.programExercises.map((ex) => {
            if (ex.id === a.id) return { ...ex, sortOrder: b.sortOrder };
            if (ex.id === b.id) return { ...ex, sortOrder: a.sortOrder };
            return ex;
          }),
        });
      });
    },
    [update],
  );

  const startSession = useCallback(async (date?: string) => {
    const current = state;
    if (!current) throw new Error('Not ready');
    if (!current.program.locked) {
      throw new Error('Lock the program before logging');
    }
    const existing = [...current.sessions]
      .reverse()
      .find((session) => session.programId === current.program.id && !session.endedAt);
    if (existing) return existing;
    const session: Session = {
      id: createId(),
      programId: current.program.id,
      date: isDateKey(date) ? date : todayLocalDateKey(),
      startedAt: nowIso(),
    };
    await persist({ ...current, sessions: [...current.sessions, session] });
    return session;
  }, [persist, state]);

  const setSessionDate = useCallback(
    async (date: string) => {
      if (!isDateKey(date)) {
        throw new Error('Pick a valid date');
      }
      await update((current) => ({
        ...current,
        sessions: current.sessions.map((session) =>
          session.endedAt ? session : { ...session, date },
        ),
      }));
    },
    [update],
  );

  const endSession = useCallback(async () => {
    const next = await update((current) => ({
      ...syncLogDraftSession(current, null),
      sessions: current.sessions.map((session) =>
        session.endedAt ? session : { ...session, endedAt: nowIso() },
      ),
      logDraft: emptyLogDraft(),
    }));
    void maybeUploadAutoBackup(next);
  }, [syncLogDraftSession, update]);

  const logSet = useCallback(
    async (programExerciseId: string, weight: number, reps: number, date?: string) => {
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error('Enter a weight');
      }
      if (!Number.isFinite(reps) || reps <= 0 || !Number.isInteger(reps)) {
        throw new Error('Enter reps');
      }
      const current = state;
      if (!current) throw new Error('Not ready');
      if (!current.program.locked) {
        throw new Error('Lock the program before logging');
      }
      let session = [...current.sessions]
        .reverse()
        .find((item) => item.programId === current.program.id && !item.endedAt);
      const sessions = [...current.sessions];
      if (!session) {
        session = {
          id: createId(),
          programId: current.program.id,
          date: isDateKey(date) ? date : todayLocalDateKey(),
          startedAt: nowIso(),
        };
        sessions.push(session);
      }
      const siblings = current.setEntries.filter(
        (set) => set.sessionId === session.id && set.programExerciseId === programExerciseId,
      );
      const entry: SetEntry = {
        id: createId(),
        sessionId: session.id,
        programExerciseId,
        weight,
        reps,
        sortOrder: siblings.reduce((max, set) => Math.max(max, set.sortOrder), -1) + 1,
        createdAt: nowIso(),
      };
      const exercise = current.programExercises.find((ex) => ex.id === programExerciseId);
      const preset = normalizeRestSeconds(current.prefs.restSeconds ?? DEFAULT_REST_SECONDS);
      const loggedCount =
        siblings.length +
        1;
      const nextDraft = setStickyForExercise(
        logDraftForSession(current.logDraft, session.id),
        programExerciseId,
        { weight, reps },
      );
      const restMeta: Omit<RestTimerDraft, 'endsAtMs'> = {
        exerciseId: programExerciseId,
        exerciseName: exercise?.name ?? 'Lift',
        setNumber: loggedCount,
        nextLabel: `${weight} kg × ${reps}`,
      };
      const restTimer = startRestTimer(nextDraft.restTimer, preset, restMeta);

      await persist({
        ...current,
        sessions,
        setEntries: [...current.setEntries, entry],
        logDraft: { ...nextDraft, restTimer },
      });
    },
    [persist, state],
  );

  const removeSet = useCallback(
    async (id: string) => {
      await update((current) => ({
        ...current,
        setEntries: current.setEntries.filter((set) => set.id !== id),
      }));
    },
    [update],
  );

  const updateSet = useCallback(
    async (id: string, patch: { weight?: number; reps?: number }) => {
      await update((current) => ({
        ...current,
        setEntries: current.setEntries.map((set) => {
          if (set.id !== id) return set;
          const weight = patch.weight ?? set.weight;
          const reps = patch.reps ?? set.reps;
          return { ...set, weight, reps };
        }),
      }));
    },
    [update],
  );

  const setStickyDraft = useCallback(
    async (exerciseId: string, patch: Partial<{ weight: number; reps: number }>) => {
      await update((current) => {
        const sessionId =
          [...current.sessions]
            .reverse()
            .find((s) => s.programId === current.program.id && !s.endedAt)?.id ?? null;
        const base = logDraftForSession(current.logDraft, sessionId);
        return {
          ...current,
          logDraft: setStickyForExercise(base, exerciseId, patch),
        };
      });
    },
    [update],
  );

  const addDraftSetRow = useCallback(
    async (exerciseId: string) => {
      await update((current) => {
        const sessionId =
          [...current.sessions]
            .reverse()
            .find((s) => s.programId === current.program.id && !s.endedAt)?.id ?? null;
        const base = logDraftForSession(current.logDraft, sessionId);
        return {
          ...current,
          logDraft: addExtraSetRow(base, exerciseId),
        };
      });
    },
    [update],
  );

  const setRestTimerDraft = useCallback(
    async (timer: RestTimerDraft | null) => {
      await update((current) => ({
        ...current,
        logDraft: {
          ...(current.logDraft ?? emptyLogDraft()),
          restTimer: timer,
        },
      }));
    },
    [update],
  );

  const bumpRestTimer = useCallback(
    async (presetSeconds: RestPreset | 'extend30') => {
      await update((current) => {
        const draft = current.logDraft ?? emptyLogDraft();
        const timer = draft.restTimer;
        if (!timer) return current;
        const nextTimer =
          presetSeconds === 'extend30'
            ? extendRestTimer(timer, 30)
            : restartRestTimer(timer, presetSeconds);
        const prefsPatch =
          presetSeconds !== 'extend30' && presetSeconds !== current.prefs.restSeconds
            ? { restSeconds: presetSeconds }
            : {};
        return {
          ...current,
          prefs: { ...current.prefs, ...prefsPatch },
          logDraft: { ...draft, restTimer: nextTimer },
        };
      });
    },
    [update],
  );

  const setExerciseNote = useCallback(
    async (programExerciseId: string, text: string, date?: string) => {
      const current = state;
      if (!current) throw new Error('Not ready');
      if (!current.program.locked) {
        throw new Error('Lock the program before logging');
      }
      const trimmed = text.trim();
      let session = [...current.sessions]
        .reverse()
        .find((item) => item.programId === current.program.id && !item.endedAt);
      if (!session && !trimmed) return;
      const sessions = [...current.sessions];
      if (!session) {
        session = {
          id: createId(),
          programId: current.program.id,
          date: isDateKey(date) ? date : todayLocalDateKey(),
          startedAt: nowIso(),
        };
        sessions.push(session);
      }
      await persist({
        ...current,
        sessions,
        exerciseNotes: upsertExerciseNote(
          current.exerciseNotes ?? [],
          session.id,
          programExerciseId,
          trimmed,
        ),
      });
    },
    [persist, state],
  );

  const exportBackup = useCallback(async () => {
    const current = state;
    if (!current) throw new Error('Not ready');
    const next: GymState = {
      ...current,
      prefs: resetBackupSchedule(current.prefs, loggedSessionCount(current.setEntries)),
    };
    await persist(next);
    return JSON.stringify(serializeBackup(next), null, 2);
  }, [persist, state]);

  const importBackup = useCallback(
    async (raw: unknown) => {
      const next = { ...parseBackup(raw), logDraft: emptyLogDraft() };
      await persist(next);
    },
    [persist],
  );

  const dismissBackupNudge = useCallback(async () => {
    await update((current) => ({
      ...current,
      prefs: snoozeBackupSchedule(current.prefs, loggedSessionCount(current.setEntries)),
    }));
  }, [update]);

  const setBackupPrefs = useCallback(
    async (
      patch: Partial<
        Pick<BackupPrefs, 'remindEnabled' | 'everyDays' | 'afterSessions' | 'restSeconds'>
      >,
    ) => {
      await update((current) => ({
        ...current,
        prefs: {
          ...current.prefs,
          ...(patch.remindEnabled !== undefined ? { remindEnabled: patch.remindEnabled } : {}),
          ...(patch.everyDays !== undefined
            ? { everyDays: Math.min(365, Math.max(0, Math.floor(patch.everyDays))) }
            : {}),
          ...(patch.afterSessions !== undefined
            ? { afterSessions: Math.min(99, Math.max(0, Math.floor(patch.afterSessions))) }
            : {}),
          ...(patch.restSeconds !== undefined
            ? { restSeconds: normalizeRestSeconds(patch.restSeconds) }
            : {}),
        },
      }));
    },
    [update],
  );

  const value = useMemo<GymStore>(
    () => ({
      ready,
      error,
      state,
      heaviest,
      openSession,
      setTitle,
      lockProgram,
      unlockProgram,
      addCategory,
      renameCategory,
      removeCategory,
      moveCategory,
      addExercise,
      renameExercise,
      removeExercise,
      moveExercise,
      startSession,
      setSessionDate,
      endSession,
      logSet,
      setExerciseNote,
      removeSet,
      updateSet,
      setStickyDraft,
      addDraftSetRow,
      setRestTimerDraft,
      bumpRestTimer,
      exportBackup,
      importBackup,
      backupDue,
      dismissBackupNudge,
      setBackupPrefs,
      swapExercise,
    }),
    [
      addCategory,
      addExercise,
      backupDue,
      dismissBackupNudge,
      endSession,
      error,
      exportBackup,
      heaviest,
      importBackup,
      lockProgram,
      moveCategory,
      moveExercise,
      openSession,
      ready,
      removeCategory,
      removeExercise,
      removeSet,
      updateSet,
      setStickyDraft,
      addDraftSetRow,
      setRestTimerDraft,
      bumpRestTimer,
      renameCategory,
      renameExercise,
      setBackupPrefs,
      setExerciseNote,
      setSessionDate,
      setTitle,
      startSession,
      state,
      swapExercise,
      unlockProgram,
      logSet,
    ],
  );

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
}

export function useGym(): GymStore {
  const store = useContext(GymContext);
  if (!store) throw new Error('useGym must be used inside GymProvider');
  return store;
}

export function sortedCategories(state: GymState): Category[] {
  return sortByOrder(state.categories);
}

export function exercisesFor(state: GymState, categoryId: string): ProgramExercise[] {
  return sortByOrder(
    state.programExercises.filter((ex) => ex.categoryId === categoryId && !ex.retired),
  );
}
