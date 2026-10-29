import { parseBackup, serializeBackup } from './backup';
import {
  defaultBackupPrefs,
  isBackupDue,
  loggedSessionCount,
  normalizeBackupPrefs,
  resetBackupSchedule,
  snoozeBackupSchedule,
} from './backupPrefs';
import { migrateState } from './db';
import { lastSessionTopSet } from './lastSession';
import {
  DEFAULT_REST_SECONDS,
  formatRestClock,
  formatRestPresetLabel,
  normalizeRestSeconds,
  restSecondsLeft,
} from './restTimer';
import type { ExerciseNote, GymState, Session, SetEntry } from './types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const programId = 'p1';
const exA = 'ex-a';
const sessionOld: Session = {
  id: 's-old',
  programId,
  date: '2026-09-01',
  startedAt: '2026-09-01T10:00:00.000Z',
  endedAt: '2026-09-01T11:00:00.000Z',
};
const sessionMid: Session = {
  id: 's-mid',
  programId,
  date: '2026-09-10',
  startedAt: '2026-09-10T10:00:00.000Z',
  endedAt: '2026-09-10T11:00:00.000Z',
};
const sessionOpen: Session = {
  id: 's-open',
  programId,
  date: '2026-09-17',
  startedAt: '2026-09-17T10:00:00.000Z',
};

const sets: SetEntry[] = [
  {
    id: '1',
    sessionId: sessionOld.id,
    programExerciseId: exA,
    weight: 100,
    reps: 5,
    sortOrder: 0,
    createdAt: '2026-09-01T10:01:00.000Z',
  },
  {
    id: '2',
    sessionId: sessionMid.id,
    programExerciseId: exA,
    weight: 80,
    reps: 8,
    sortOrder: 0,
    createdAt: '2026-09-10T10:01:00.000Z',
  },
  {
    id: '3',
    sessionId: sessionMid.id,
    programExerciseId: exA,
    weight: 80,
    reps: 6,
    sortOrder: 1,
    createdAt: '2026-09-10T10:02:00.000Z',
  },
  {
    id: '4',
    sessionId: sessionOpen.id,
    programExerciseId: exA,
    weight: 90,
    reps: 3,
    sortOrder: 0,
    createdAt: '2026-09-17T10:01:00.000Z',
  },
];

const lastOpen = lastSessionTopSet(exA, [sessionOld, sessionMid, sessionOpen], sets, sessionOpen.id);
assert(lastOpen?.weight === 80 && lastOpen.reps === 8 && lastOpen.date === '2026-09-10', 'top set from prior session');

const lastClosed = lastSessionTopSet(exA, [sessionOld, sessionMid, sessionOpen], sets, null);
assert(lastClosed?.weight === 90 && lastClosed.date === '2026-09-17', 'no open session uses most recent');

assert(
  lastSessionTopSet('missing', [sessionOld], sets, null) === null,
  'omit glance when no history',
);

const prefs = defaultBackupPrefs(0, new Date('2026-09-01T00:00:00'));
assert(prefs.remindEnabled && prefs.everyDays === 7 && prefs.afterSessions === 4, 'gentle defaults');
assert(prefs.restSeconds === DEFAULT_REST_SECONDS, 'rest default 180');
assert(normalizeRestSeconds(120) === 120, 'rest preset 120');
assert(normalizeRestSeconds(180) === 180, 'rest preset 180');
assert(normalizeRestSeconds(300) === 300, 'rest preset 300');
assert(normalizeRestSeconds(45) === 180, 'legacy 45 migrates to 180');
assert(normalizeRestSeconds(60) === 180, 'legacy 60 migrates to 180');
assert(normalizeRestSeconds(90) === 180, 'legacy 90 migrates to 180');
assert(normalizeRestSeconds(12) === 180, 'invalid rest falls back to 180');
assert(formatRestClock(180) === '3:00', 'rest clock 180s');
assert(formatRestClock(120) === '2:00', 'rest clock 120s');
assert(formatRestClock(9) === '0:09', 'rest clock pads seconds');
assert(formatRestPresetLabel(120) === '2m', 'preset label 2m');
assert(formatRestPresetLabel(180) === '3m', 'preset label 3m');
assert(formatRestPresetLabel(300) === '5m', 'preset label 5m');
assert(restSecondsLeft(1_000, 1_000) === 0, 'rest done at endsAt');
assert(restSecondsLeft(2_400, 1_000) === 2, 'rest ceils remaining');
assert(!isBackupDue(prefs, [], new Date('2026-09-06')), 'not due before 7 days');
assert(isBackupDue(prefs, [], new Date('2026-09-08')), 'due after 7 days');

const fourSessions = [
  { ...sets[0], sessionId: 'a' },
  { ...sets[0], sessionId: 'b', id: 'b' },
  { ...sets[0], sessionId: 'c', id: 'c' },
  { ...sets[0], sessionId: 'd', id: 'd' },
];
assert(
  isBackupDue({ ...prefs, lastResetAt: '2026-09-17T00:00:00.000Z' }, fourSessions, new Date('2026-09-17')),
  'due after 4 sessions',
);

const snoozed = snoozeBackupSchedule(prefs, loggedSessionCount(fourSessions), '2026-09-17T12:00:00.000Z');
assert(
  !isBackupDue(snoozed, fourSessions, new Date('2026-09-17')),
  'dismiss snoozes until next interval',
);

const exported = resetBackupSchedule(prefs, 2, '2026-09-17T12:00:00.000Z');
assert(exported.lastExportedAt === '2026-09-17T12:00:00.000Z', 'export stamps lastExportedAt');
assert(!isBackupDue(exported, fourSessions.slice(0, 2), new Date('2026-09-17')), 'export resets schedule');

const migrated = migrateState({
  program: {
    id: programId,
    title: 'Weekly lift',
    locked: true,
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  categories: [{ id: 'c1', programId, name: 'Push', sortOrder: 0 }],
  programExercises: [{ id: exA, categoryId: 'c1', name: 'Bench press', sortOrder: 0 }],
  sessions: [sessionOld],
  setEntries: [sets[0]],
});
assert(migrated.changed, 'migrate adds prefs in place');
assert(migrated.state.prefs.remindEnabled, 'prefs default on');
assert(migrated.state.sessions[0].date === '2026-09-01', 'dates intact');
assert(migrated.state.setEntries[0].weight === 100, 'sets intact');
assert(migrated.state.exerciseNotes.length === 0, 'missing notes migrate to empty');
assert(migrated.state.logDraft?.sessionId === null, 'missing logDraft migrates empty');

const note: ExerciseNote = {
  sessionId: sessionOld.id,
  programExerciseId: exA,
  text: 'slow eccentric, left knee',
};

const state: GymState = {
  ...migrated.state,
  programExercises: [
    { ...migrated.state.programExercises[0], retired: true },
    { id: 'ex-new', categoryId: 'c1', name: 'Dumbbell press', sortOrder: 0 },
  ],
  exerciseNotes: [note],
  prefs: exported,
};
const roundTrip = parseBackup(serializeBackup(state));
assert(roundTrip.prefs.lastExportedAt === exported.lastExportedAt, 'prefs round-trip');
assert(roundTrip.prefs.restSeconds === DEFAULT_REST_SECONDS, 'default rest round-trip');

const withRest = { ...state, prefs: { ...exported, restSeconds: 300 as const } };
const restTrip = parseBackup(serializeBackup(withRest));
assert(restTrip.prefs.restSeconds === 300, 'preferred rest seconds round-trip');
assert(
  parseBackup(serializeBackup({ ...state, prefs: { ...exported, restSeconds: 120 as const } }))
    .prefs.restSeconds === 120,
  '2m rest round-trip',
);
assert(restTrip.setEntries.length === state.setEntries.length, 'sets intact with rest pref');
assert(restTrip.exerciseNotes[0]?.text === note.text, 'notes intact with rest pref');
assert(roundTrip.programExercises.some((ex) => ex.retired && ex.name === 'Bench press'), 'retired round-trip');
assert(roundTrip.programExercises.some((ex) => ex.id === 'ex-new'), 'swap slot round-trip');
assert(roundTrip.exerciseNotes[0]?.text === note.text, 'notes round-trip');
assert(roundTrip.exerciseNotes[0]?.sessionId === note.sessionId, 'note stays on session');
assert(roundTrip.exerciseNotes[0]?.programExerciseId === note.programExerciseId, 'note stays on exercise');

const oldBackup = serializeBackup(state) as unknown as Record<string, unknown>;
delete oldBackup.prefs;
const fromOld = parseBackup(oldBackup);
assert(fromOld.prefs.remindEnabled, 'old backup gets default prefs');
assert(fromOld.prefs.restSeconds === DEFAULT_REST_SECONDS, 'old backup gets default rest');

const legacyRestBackup = serializeBackup(withRest) as unknown as Record<string, unknown>;
(legacyRestBackup.prefs as Record<string, unknown>).restSeconds = 90;
const fromLegacyRest = parseBackup(legacyRestBackup);
assert(fromLegacyRest.prefs.restSeconds === 180, 'import migrates obsolete rest');
assert(fromLegacyRest.exerciseNotes[0]?.text === note.text, 'notes intact on rest import migrate');
assert(fromOld.setEntries.length === 1, 'old backup keeps sets');
assert(fromOld.exerciseNotes[0]?.text === note.text, 'notes survive prefs-less backup');

const noNotesBackup = serializeBackup(state) as unknown as Record<string, unknown>;
delete noNotesBackup.exerciseNotes;
const fromNoNotes = parseBackup(noNotesBackup);
assert(fromNoNotes.exerciseNotes.length === 0, 'old backup without notes still loads');
assert(fromNoNotes.setEntries.length === 1, 'sets intact without notes field');

assert(normalizeBackupPrefs(undefined, 3).sessionCountAtReset === 3, 'missing prefs uses current session count');
assert(normalizeBackupPrefs({ restSeconds: 300 }, 0).restSeconds === 300, 'normalize keeps rest preset');
assert(normalizeBackupPrefs({ restSeconds: 45 }, 0).restSeconds === 180, 'normalize migrates legacy rest');
assert(normalizeBackupPrefs({ restSeconds: 12 }, 0).restSeconds === 180, 'normalize rejects bad rest');

const restMigrated = migrateState({
  program: migrated.state.program,
  categories: migrated.state.categories,
  programExercises: migrated.state.programExercises,
  sessions: migrated.state.sessions,
  setEntries: migrated.state.setEntries,
  exerciseNotes: migrated.state.exerciseNotes,
  prefs: {
    remindEnabled: true,
    everyDays: 7,
    afterSessions: 4,
    lastExportedAt: null,
    lastResetAt: '2026-09-01T00:00:00.000Z',
    sessionCountAtReset: 1,
  },
});
assert(restMigrated.changed, 'migrate adds restSeconds in place');
assert(restMigrated.state.prefs.restSeconds === 180, 'migrated rest default');
assert(restMigrated.state.prefs.remindEnabled, 'backup prefs stay');
assert(restMigrated.state.setEntries[0].weight === 100, 'sets intact during rest migrate');
assert(restMigrated.state.exerciseNotes.length === 0, 'notes intact during rest migrate');

const legacyRestMigrated = migrateState({
  program: migrated.state.program,
  categories: migrated.state.categories,
  programExercises: migrated.state.programExercises,
  sessions: migrated.state.sessions,
  setEntries: migrated.state.setEntries,
  exerciseNotes: migrated.state.exerciseNotes,
  prefs: {
    remindEnabled: true,
    everyDays: 7,
    afterSessions: 4,
    lastExportedAt: null,
    lastResetAt: '2026-09-01T00:00:00.000Z',
    sessionCountAtReset: 1,
    restSeconds: 60,
  },
});
assert(legacyRestMigrated.changed, 'migrate rewrites obsolete rest preset');
assert(legacyRestMigrated.state.prefs.restSeconds === 180, 'legacy 60 becomes 180');
assert(legacyRestMigrated.state.prefs.remindEnabled, 'backup prefs stay on rest rewrite');
assert(legacyRestMigrated.state.setEntries[0].weight === 100, 'sets intact during rest rewrite');

console.log('checkLogic: ok');
