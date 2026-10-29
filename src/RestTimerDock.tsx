import { useEffect, useState } from 'react';
import {
  formatRestClock,
  formatRestPresetLabel,
  REST_PRESETS,
  restSecondsLeft,
  type RestPreset,
} from './restTimer';
import type { RestTimerDraft } from './types';

export function RestTimerDock({
  timer,
  activePreset,
  onPreset,
  onExtend30,
  onDismiss,
}: {
  timer: RestTimerDraft;
  activePreset: RestPreset;
  onPreset: (seconds: RestPreset) => void;
  onExtend30: () => void;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const left = restSecondsLeft(timer.endsAtMs, now);

  return (
    <div className="rest-dock" role="timer" aria-live="polite">
      <div className="rest-dock-left">
        <span className={left === 0 ? 'rest-dock-clock done' : 'rest-dock-clock'}>
          {formatRestClock(left)}
        </span>
        <div className="rest-dock-meta">
          <div className="rest-dock-title">
            Rest · {timer.exerciseName} set {timer.setNumber}
          </div>
          <div className="rest-dock-next">Next: {timer.nextLabel}</div>
        </div>
      </div>
      <div className="rest-dock-pills">
        {REST_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={preset === activePreset ? 'rest-dock-pill on' : 'rest-dock-pill'}
            onClick={() => onPreset(preset)}
          >
            {formatRestPresetLabel(preset)}
          </button>
        ))}
        <button type="button" className="rest-dock-pill" onClick={onExtend30}>
          +30s
        </button>
        <button type="button" className="rest-dock-pill dismiss" aria-label="Dismiss rest" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  );
}
