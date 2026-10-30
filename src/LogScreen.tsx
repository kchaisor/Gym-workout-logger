import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDateKey, formatDateKeyCompact, isDateKey, todayLocalDateKey } from './dates';
import { noteText } from './exerciseNotes';
import {
  currentRowDraftValues,
  stepStickyReps,
  stepStickyWeight,
} from './logControls';
import {
  defaultRowValues,
  emptyLogDraft,
  rowCountForExercise,
  stickyForExercise,
} from './logDraft';
import { lastSessionSets, type LastSessionSnapshot } from './lastSession';
import {
  formatLastSetsCompact,
  formatPrBadge,
  progressionBadge,
} from './progression';
import { exercisesFor, sortedCategories, useGym } from './store';
import type { ProgramExercise, SetEntry } from './types';

function sessionMinutes(startedAt: string): number {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 60_000));
}

function LogExerciseCard({
  exercise,
  sessionSets,
  lastSnapshot,
  note,
  locked,
  sticky,
  rowCount,
  editingSetId,
  onEditSet,
  onCloseEdit,
  onLog,
  onRemoveSet,
  onUpdateSet,
  onSaveNote,
  onStickyChange,
  onAddRow,
  heaviestLabel,
  progressionLabel,
  progressionKind,
}: {
  exercise: ProgramExercise;
  sessionSets: SetEntry[];
  lastSnapshot: LastSessionSnapshot | null;
  note: string;
  locked: boolean;
  sticky: { weight: number; reps: number };
  rowCount: number;
  editingSetId: string | null;
  onEditSet: (id: string) => void;
  onCloseEdit: () => void;
  onLog: (weight: number, reps: number) => Promise<void>;
  onRemoveSet: (id: string) => Promise<void>;
  onUpdateSet: (id: string, patch: { weight?: number; reps?: number }) => Promise<void>;
  onSaveNote: (text: string) => Promise<void>;
  onStickyChange: (patch: Partial<{ weight: number; reps: number }>) => void;
  onAddRow: () => void;
  heaviestLabel: string | null;
  progressionLabel: string | null;
  progressionKind: 'earn-weight' | 'add-reps' | 'match' | null;
}) {
  const lastSets = lastSnapshot?.sets ?? [];
  const [noteOpen, setNoteOpen] = useState(Boolean(note.trim()));
  const [draftNote, setDraftNote] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusedNote = useRef(false);
  const [draftSticky, setDraftSticky] = useState(sticky);

  useEffect(() => {
    if (!focusedNote.current) setDraftNote(note);
    if (note.trim()) setNoteOpen(true);
  }, [note]);

  useEffect(() => {
    setDraftSticky(sticky);
  }, [sticky.weight, sticky.reps]);

  const currentRowIndex = sessionSets.length;
  const activeExercise = currentRowIndex < rowCount;

  async function logRow(weight: number, reps: number) {
    if (!locked || busy) return;
    if (weight < 0 || reps <= 0) {
      setError('Set weight and reps');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onLog(weight, reps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log');
    } finally {
      setBusy(false);
    }
  }

  function stepWeight(delta: number) {
    const weight = stepStickyWeight(draftSticky.weight, delta);
    setDraftSticky((prev) => ({ ...prev, weight }));
    onStickyChange({ weight });
  }

  function stepReps(delta: number) {
    const reps = stepStickyReps(draftSticky.reps, delta);
    setDraftSticky((prev) => ({ ...prev, reps }));
    onStickyChange({ reps });
  }

  const lastHeader = lastSnapshot
    ? `Last (${formatDateKeyCompact(lastSnapshot.date)})`
    : 'Last';

  return (
    <article className={`card exercise hybrid-card${activeExercise ? ' active-card' : ''}`}>
      <div className="hybrid-card-head">
        <div>
          <h3>{exercise.name}</h3>
          {lastSnapshot && lastSets.length > 0 && (
            <p className="last-sets-line">
              Last ({formatDateKeyCompact(lastSnapshot.date)}): {formatLastSetsCompact(lastSets)}
            </p>
          )}
        </div>
        <div className="hybrid-badges">
          {heaviestLabel && <span className="pr-pill">{heaviestLabel}</span>}
          {progressionLabel && (
            <span
              className={
                progressionKind === 'earn-weight' ? 'prog-pill earn' : 'prog-pill'
              }
            >
              {progressionKind === 'earn-weight' ? '🏋️ ' : ''}
              {progressionLabel}
            </span>
          )}
        </div>
      </div>

      {noteOpen ? (
        <div className="note-chip">
          <textarea
            className="exercise-note inline-note"
            rows={1}
            value={draftNote}
            placeholder="Note"
            aria-label={`${exercise.name} notes`}
            disabled={!locked || busy}
            onFocus={() => {
              focusedNote.current = true;
            }}
            onChange={(event) => setDraftNote(event.target.value)}
            onBlur={() => {
              focusedNote.current = false;
              if (draftNote.trim() === note.trim()) return;
              void onSaveNote(draftNote).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Could not save note');
              });
            }}
          />
          <button type="button" className="note-edit-btn" onClick={() => setNoteOpen(true)}>
            Edit
          </button>
        </div>
      ) : (
        <button type="button" className="note-add-chip" onClick={() => setNoteOpen(true)}>
          + Note
        </button>
      )}

      <div className="set-table">
        <div className="set-thead">
          <span>Set</span>
          <span>{lastHeader}</span>
          <span className="center-col">kg</span>
          <span className="center-col">Reps</span>
          <span className="end-col">Log</span>
        </div>
        {Array.from({ length: rowCount }, (_, rowIndex) => {
          const logged = sessionSets[rowIndex] ?? null;
          const isDone = Boolean(logged);
          const isCurrent = !isDone && rowIndex === currentRowIndex;
          const rowVals = isCurrent
            ? currentRowDraftValues(rowIndex, lastSets, draftSticky)
            : defaultRowValues(rowIndex, lastSets, draftSticky);
          const displayWeight = isDone ? logged!.weight : rowVals.weight;
          const displayReps = isDone ? logged!.reps : rowVals.reps;
          const lastCol = rowVals.lastLabel ?? '—';

          if (isDone && editingSetId === logged!.id) {
            return (
              <div key={logged!.id} className="set-trow editing">
                <span className="set-num">{rowIndex + 1}</span>
                <span className="set-last">{lastCol}</span>
                <input
                  className="set-val-input"
                  inputMode="decimal"
                  value={displayWeight}
                  aria-label="Edit weight"
                  onChange={(event) => {
                    const w = Number(event.target.value);
                    if (Number.isFinite(w)) void onUpdateSet(logged!.id, { weight: w });
                  }}
                />
                <input
                  className="set-val-input"
                  inputMode="numeric"
                  value={displayReps}
                  aria-label="Edit reps"
                  onChange={(event) => {
                    const r = Number(event.target.value);
                    if (Number.isFinite(r)) void onUpdateSet(logged!.id, { reps: r });
                  }}
                />
                <div className="set-edit-actions">
                  <button
                    type="button"
                    className="btn ghost set-edit-btn"
                    onClick={() => {
                      onCloseEdit();
                    }}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="btn danger set-edit-btn"
                    onClick={() => {
                      void onRemoveSet(logged!.id).then(() => onCloseEdit());
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={logged?.id ?? `row-${rowIndex}`}
              className={`set-trow${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}
            >
              <span className={`set-num${isCurrent ? ' active' : ''}`}>{rowIndex + 1}</span>
              <span className="set-last">{lastCol}</span>
              <span className="set-val">{displayWeight}</span>
              <span className="set-val">{displayReps}</span>
              {isDone ? (
                <button
                  type="button"
                  className="set-chk on"
                  aria-label={`Edit set ${rowIndex + 1}`}
                  onClick={() => onEditSet(logged!.id)}
                >
                  ✓
                </button>
              ) : (
                <button
                  type="button"
                  className={isCurrent ? 'set-chk ready' : 'set-chk idle'}
                  disabled={!locked || busy || !isCurrent}
                  aria-label={`Log set ${rowIndex + 1}`}
                  onClick={() => void logRow(displayWeight, displayReps)}
                >
                  ✓
                </button>
              )}
            </div>
          );
        })}
      </div>

      {activeExercise && (
        <div className="set-steppers">
          <div className="step-group">
            <span className="step-lbl">kg</span>
            <button type="button" className="step-btn" onClick={() => stepWeight(-2.5)}>
              −2.5
            </button>
            <button type="button" className="step-btn hi" onClick={() => stepWeight(2.5)}>
              +2.5
            </button>
            <button type="button" className="step-btn" onClick={() => stepWeight(5)}>
              +5
            </button>
          </div>
          <div className="step-group">
            <span className="step-lbl">Reps</span>
            <button type="button" className="step-btn" onClick={() => stepReps(-1)}>
              −1
            </button>
            <button type="button" className="step-btn hi" onClick={() => stepReps(1)}>
              +1
            </button>
            <button type="button" className="step-btn" onClick={onAddRow}>
              +Set
            </button>
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
    </article>
  );
}

export function LogScreen({ onNeedProgram }: { onNeedProgram: () => void }) {
  const {
    state,
    openSession,
    heaviest,
    startSession,
    setSessionDate,
    endSession,
    logSet,
    removeSet,
    updateSet,
    setExerciseNote,
    setStickyDraft,
    addDraftSetRow,
  } = useGym();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState(todayLocalDateKey);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<{ exerciseId: string; setId: string } | null>(
    null,
  );
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!openSession) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [openSession?.id]);

  useEffect(() => {
    if (dateOpen) dateInputRef.current?.showPicker?.();
  }, [dateOpen]);

  const categories = state ? sortedCategories(state) : [];
  const activeId = categoryId && categories.some((cat) => cat.id === categoryId)
    ? categoryId
    : categories[0]?.id ?? null;
  const exercises = state && activeId ? exercisesFor(state, activeId) : [];
  const sessionSets = useMemo(() => {
    if (!state || !openSession) return [];
    return state.setEntries
      .filter((set) => set.sessionId === openSession.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }, [openSession, state]);

  const lastByExercise = useMemo(() => {
    const map = new Map<string, LastSessionSnapshot>();
    if (!state) return map;
    for (const exercise of state.programExercises) {
      if (exercise.retired) continue;
      const snap = lastSessionSets(
        exercise.id,
        state.sessions,
        state.setEntries,
        openSession?.id,
      );
      if (snap) map.set(exercise.id, snap);
    }
    return map;
  }, [openSession?.id, state]);

  if (!state) return null;

  const locked = state.program.locked;
  const selectedDate = openSession?.date ?? draftDate;
  const logDraft = state.logDraft;
  const durationLabel = openSession ? `${sessionMinutes(openSession.startedAt)}m` : null;

  async function onDateChange(next: string) {
    if (!isDateKey(next)) return;
    setActionError(null);
    setDateOpen(false);
    if (openSession) {
      try {
        await setSessionDate(next);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not change date');
      }
    } else {
      setDraftDate(next);
    }
  }

  async function onStartOrEnd() {
    setActionError(null);
    try {
      if (openSession) {
        await endSession();
        setDraftDate(todayLocalDateKey());
      } else {
        await startSession(selectedDate);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update session');
    }
  }

  return (
    <section className="screen log-screen">
      <header className="log-header">
        <div className="log-header-row">
          <div className="log-title-wrap">
            <h2 className="log-program-title">{state.program.title}</h2>
            {locked && <span className="log-lock-badge">🔒 Locked</span>}
          </div>
          <div className="log-header-actions">
            {locked && (
              <>
                <button
                  type="button"
                  className="log-date-pill"
                  onClick={() => setDateOpen(true)}
                >
                  {formatDateKey(selectedDate, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {durationLabel ? ` · ${durationLabel}` : ''}
                </button>
                <input
                  ref={dateInputRef}
                  type="date"
                  className="visually-hidden-date"
                  value={selectedDate}
                  tabIndex={-1}
                  aria-hidden={!dateOpen}
                  onChange={(event) => void onDateChange(event.target.value)}
                  onBlur={() => setDateOpen(false)}
                />
              </>
            )}
            {locked && (
              <button className="btn primary log-end-btn" type="button" onClick={() => void onStartOrEnd()}>
                {openSession ? 'End' : 'Start'}
              </button>
            )}
          </div>
        </div>
        {locked && (
          <div className="split-rail" role="tablist" aria-label="Day">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={cat.id === activeId}
                className={cat.id === activeId ? 'split-tab on' : 'split-tab'}
                onClick={() => setCategoryId(cat.id)}
              >
                {cat.name}
                <span className="split-count">
                  {exercisesFor(state, cat.id).length}
                </span>
              </button>
            ))}
          </div>
        )}
      </header>

      {!locked && (
        <div className="banner">
          <p>Lock your weekly program before logging sets.</p>
          <button className="btn primary" type="button" onClick={onNeedProgram}>
            Open program
          </button>
        </div>
      )}

      {actionError && <p className="form-error">{actionError}</p>}

      <div className="stack log-stack">
        {exercises.map((exercise) => {
          const sets = sessionSets.filter((set) => set.programExerciseId === exercise.id);
          const lastSnap = lastByExercise.get(exercise.id) ?? null;
          const lastSets = lastSnap?.sets ?? [];
          const fallbackWeight = lastSets[0]?.weight ?? 0;
          const fallbackReps = lastSets[0]?.reps ?? 8;
          const sticky = stickyForExercise(
            logDraft ?? { sessionId: null, stickyByExercise: {}, extraSetRows: {}, restTimer: null },
            exercise.id,
            fallbackWeight,
            fallbackReps,
          );
          const prog = progressionBadge(lastSets);
          const best = heaviest.get(exercise.id);

          return (
            <LogExerciseCard
              key={exercise.id}
              exercise={exercise}
              sessionSets={sets}
              lastSnapshot={lastSnap}
              note={noteText(state.exerciseNotes, openSession?.id, exercise.id)}
              locked={locked}
              sticky={sticky}
              rowCount={rowCountForExercise(
                logDraft ?? emptyLogDraft(),
                exercise.id,
                lastSets.length,
                sets.length,
              )}
              editingSetId={
                editingSet?.exerciseId === exercise.id ? editingSet.setId : null
              }
              onEditSet={(setId) => setEditingSet({ exerciseId: exercise.id, setId })}
              onCloseEdit={() => setEditingSet(null)}
              onLog={(weight, reps) => logSet(exercise.id, weight, reps, selectedDate)}
              onRemoveSet={removeSet}
              onUpdateSet={updateSet}
              onSaveNote={(text) => setExerciseNote(exercise.id, text, selectedDate)}
              onStickyChange={(patch) => void setStickyDraft(exercise.id, patch)}
              onAddRow={() => void addDraftSetRow(exercise.id)}
              heaviestLabel={formatPrBadge(best ?? null)}
              progressionLabel={prog?.label ?? null}
              progressionKind={prog?.kind ?? null}
            />
          );
        })}
        {exercises.length === 0 && locked && <p className="muted">No exercises on this day.</p>}
      </div>
    </section>
  );
}
