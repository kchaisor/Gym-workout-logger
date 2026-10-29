import type { LastSessionGlance, Session, SetEntry } from './types';

/** Top set = max weight, then max reps at that weight, from one session. */
function topSet(sets: SetEntry[]): SetEntry | null {
  let best: SetEntry | null = null;
  for (const set of sets) {
    if (
      !best ||
      set.weight > best.weight ||
      (set.weight === best.weight && set.reps > best.reps)
    ) {
      best = set;
    }
  }
  return best;
}

function isNewerSession(a: Session, b: Session): boolean {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate > 0;
  return a.startedAt.localeCompare(b.startedAt) > 0;
}

export type LastSessionSnapshot = {
  date: string;
  sets: SetEntry[];
};

function latestSessionWithSets(
  programExerciseId: string,
  sessions: Session[],
  setEntries: SetEntry[],
  excludeSessionId?: string | null,
): Session | null {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const relevant = setEntries.filter(
    (set) =>
      set.programExerciseId === programExerciseId &&
      set.sessionId !== excludeSessionId,
  );
  if (relevant.length === 0) return null;

  let latest: Session | null = null;
  for (const set of relevant) {
    const session = sessionById.get(set.sessionId);
    if (!session) continue;
    if (!latest || isNewerSession(session, latest)) {
      latest = session;
    }
  }
  return latest;
}

/**
 * Top set from the most recent session that has sets for this exercise,
 * excluding the open session (if any).
 */
export function lastSessionTopSet(
  programExerciseId: string,
  sessions: Session[],
  setEntries: SetEntry[],
  excludeSessionId?: string | null,
): LastSessionGlance | null {
  const latest = latestSessionWithSets(
    programExerciseId,
    sessions,
    setEntries,
    excludeSessionId,
  );
  if (!latest) return null;

  const relevant = setEntries.filter(
    (set) =>
      set.programExerciseId === programExerciseId && set.sessionId !== excludeSessionId,
  );
  const top = topSet(relevant.filter((set) => set.sessionId === latest.id));
  if (!top) return null;
  return { weight: top.weight, reps: top.reps, date: latest.date };
}

/** All sets from the most recent prior session, in log order. */
export function lastSessionSets(
  programExerciseId: string,
  sessions: Session[],
  setEntries: SetEntry[],
  excludeSessionId?: string | null,
): LastSessionSnapshot | null {
  const latest = latestSessionWithSets(
    programExerciseId,
    sessions,
    setEntries,
    excludeSessionId,
  );
  if (!latest) return null;

  const sets = setEntries
    .filter(
      (set) =>
        set.programExerciseId === programExerciseId && set.sessionId === latest.id,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  if (sets.length === 0) return null;
  return { date: latest.date, sets };
}
