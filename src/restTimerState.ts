import {
  DEFAULT_REST_SECONDS,
  formatRestClock,
  formatRestPresetLabel,
  REST_PRESETS,
  restSecondsLeft,
  type RestPreset,
} from './restTimer';

export type ActiveRestTimer = {
  endsAtMs: number;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  nextLabel: string;
};

export function startRestTimer(
  _current: ActiveRestTimer | null,
  presetSeconds: RestPreset,
  meta: Omit<ActiveRestTimer, 'endsAtMs'>,
  nowMs = Date.now(),
): ActiveRestTimer {
  return {
    ...meta,
    endsAtMs: nowMs + presetSeconds * 1000,
  };
}

export function extendRestTimer(
  current: ActiveRestTimer,
  extraSeconds: number,
  nowMs = Date.now(),
): ActiveRestTimer {
  const left = restSecondsLeft(current.endsAtMs, nowMs);
  return {
    ...current,
    endsAtMs: nowMs + (left + extraSeconds) * 1000,
  };
}

export function restartRestTimer(
  current: ActiveRestTimer,
  presetSeconds: RestPreset,
  nowMs = Date.now(),
): ActiveRestTimer {
  return {
    ...current,
    endsAtMs: nowMs + presetSeconds * 1000,
  };
}

export { DEFAULT_REST_SECONDS, formatRestClock, formatRestPresetLabel, REST_PRESETS, restSecondsLeft };
