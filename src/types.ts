export type Program = {
  id: string;
  title: string;
  locked: boolean;
  updatedAt: string;
};

export type Category = {
  id: string;
  programId: string;
  name: string;
  sortOrder: number;
};

export type ProgramExercise = {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
  /** Hidden from Program/Log after a locked swap; kept so History still has the name. */
  retired?: boolean;
};

export type Session = {
  id: string;
  programId: string;
  /** Local calendar day (YYYY-MM-DD) the workout belongs to. */
  date: string;
  startedAt: string;
  endedAt?: string;
};

export type SetEntry = {
  id: string;
  sessionId: string;
  programExerciseId: string;
  weight: number;
  reps: number;
  sortOrder: number;
  createdAt: string;
};

/** Per-exercise cue on a workout day, keyed by session + program exercise. */
export type ExerciseNote = {
  sessionId: string;
  programExerciseId: string;
  text: string;
};

export type HeaviestSet = {
  weight: number;
  reps: number;
};

export type LastSessionGlance = {
  weight: number;
  reps: number;
  date: string;
};

export type RestTimerDraft = {
  endsAtMs: number;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  nextLabel: string;
};

/** Session UI state persisted locally; excluded from backup export. */
export type LogDraft = {
  sessionId: string | null;
  stickyByExercise: Record<string, { weight: number; reps: number }>;
  extraSetRows: Record<string, number>;
  restTimer: RestTimerDraft | null;
};

export type BackupPrefs = {
  remindEnabled: boolean;
  everyDays: number;
  afterSessions: number;
  lastExportedAt: string | null;
  lastResetAt: string;
  sessionCountAtReset: number;
  /** Preferred rest countdown after logging a set (120 / 180 / 300). */
  restSeconds: number;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  program: Program;
  categories: Category[];
  programExercises: ProgramExercise[];
  sessions: Session[];
  setEntries: SetEntry[];
  exerciseNotes: ExerciseNote[];
  prefs: BackupPrefs;
};

export type GymState = {
  program: Program;
  categories: Category[];
  programExercises: ProgramExercise[];
  sessions: Session[];
  setEntries: SetEntry[];
  exerciseNotes: ExerciseNote[];
  prefs: BackupPrefs;
  /** Local-only workout UI draft; not exported in backup JSON. */
  logDraft?: LogDraft;
};
