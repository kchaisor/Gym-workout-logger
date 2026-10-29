import { loggedSessionCount, normalizeBackupPrefs } from './backupPrefs';
import { withCalendarDate } from './dates';
import { normalizeExerciseNotes } from './exerciseNotes';
import { seedGymState } from './seed';
import { emptyLogDraft } from './logDraft';
import type {
  BackupPrefs,
  GymState,
  LogDraft,
  ProgramExercise,
  RestTimerDraft,
  Session,
} from './types';

const DB_NAME = 'gym-workout-logger';
/** Single kv blob — do not bump; migrate fields in migrateState instead of wiping. */
const DB_VERSION = 1;
const STATE_KEY = 'state';

type StoredState = Omit<GymState, 'sessions' | 'prefs' | 'exerciseNotes' | 'logDraft'> & {
  sessions: Array<Session & { date?: string }>;
  prefs?: BackupPrefs | unknown;
  exerciseNotes?: unknown;
  logDraft?: unknown;
};

export function migrateState(stored: StoredState): { state: GymState; changed: boolean } {
  let changed = false;
  const sessions = stored.sessions.map((session) => {
    const next = withCalendarDate(session);
    if (next.date !== session.date) changed = true;
    return next;
  });
  const setEntries = Array.isArray(stored.setEntries) ? stored.setEntries : [];
  const programExercises = Array.isArray(stored.programExercises)
    ? stored.programExercises
    : [];
  const exerciseNotes = normalizeExerciseNotes(stored.exerciseNotes);
  if (!Array.isArray(stored.exerciseNotes)) changed = true;
  const sessionCount = loggedSessionCount(setEntries);
  const prefs = normalizeBackupPrefs(stored.prefs, sessionCount);
  if (JSON.stringify(stored.prefs ?? null) !== JSON.stringify(prefs)) changed = true;

  const logDraft = normalizeLogDraft(stored.logDraft);
  if (stored.logDraft === undefined) changed = true;

  return {
    state: {
      program: stored.program,
      categories: stored.categories,
      programExercises: programExercises as ProgramExercise[],
      sessions,
      setEntries,
      exerciseNotes,
      prefs,
      logDraft,
    },
    changed,
  };
}

function normalizeLogDraft(raw: unknown): LogDraft {
  if (typeof raw !== 'object' || raw === null) return emptyLogDraft();
  const draft = raw as Partial<LogDraft>;
  return {
    sessionId: typeof draft.sessionId === 'string' ? draft.sessionId : null,
    stickyByExercise:
      typeof draft.stickyByExercise === 'object' && draft.stickyByExercise !== null
        ? (draft.stickyByExercise as LogDraft['stickyByExercise'])
        : {},
    extraSetRows:
      typeof draft.extraSetRows === 'object' && draft.extraSetRows !== null
        ? (draft.extraSetRows as LogDraft['extraSetRows'])
        : {},
    restTimer:
      draft.restTimer &&
      typeof draft.restTimer === 'object' &&
      typeof (draft.restTimer as RestTimerDraft).endsAtMs === 'number'
        ? (draft.restTimer as RestTimerDraft)
        : null,
  };
}


function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function loadState(): Promise<GymState> {
  const db = await openDb();
  let stored: StoredState | undefined;
  try {
    stored = await req<StoredState | undefined>(
      db.transaction('kv', 'readonly').objectStore('kv').get(STATE_KEY),
    );
  } finally {
    db.close();
  }

  if (stored?.program && Array.isArray(stored.categories)) {
    const { state, changed } = migrateState({
      ...stored,
      sessions: Array.isArray(stored.sessions) ? stored.sessions : [],
      setEntries: Array.isArray(stored.setEntries) ? stored.setEntries : [],
      programExercises: Array.isArray(stored.programExercises) ? stored.programExercises : [],
    });
    if (changed) {
      await saveState(state);
    }
    return state;
  }

  const seeded = seedGymState();
  await saveState(seeded);
  return seeded;
}

export async function saveState(state: GymState): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(state, STATE_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  } finally {
    db.close();
  }
}
