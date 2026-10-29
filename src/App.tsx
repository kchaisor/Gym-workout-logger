import { useState } from 'react';
import { HistoryScreen } from './HistoryScreen';
import { LogScreen } from './LogScreen';
import { ProgramScreen } from './ProgramScreen';
import { RestTimerDock } from './RestTimerDock';
import { SettingsScreen } from './SettingsScreen';
import { DEFAULT_REST_SECONDS, normalizeRestSeconds } from './restTimer';
import { useGym } from './store';

type Tab = 'log' | 'history' | 'program' | 'settings';

export function App() {
  const { ready, error, state } = useGym();

  if (!ready) {
    return (
      <div className="shell">
        <p className="muted center">Loading…</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="shell">
        <p className="form-error center">{error ?? 'Could not open gym data.'}</p>
      </div>
    );
  }

  return <LoadedApp />;
}

function LoadedApp() {
  const { state, backupDue, dismissBackupNudge, bumpRestTimer, setRestTimerDraft } = useGym();
  const [tab, setTab] = useState<Tab>(state?.program.locked ? 'log' : 'program');

  if (!state) return null;

  const restTimer = state.logDraft?.restTimer ?? null;
  const restPreset = normalizeRestSeconds(state.prefs.restSeconds ?? DEFAULT_REST_SECONDS);

  return (
    <div className={`shell${restTimer ? ' has-rest-dock' : ''}`}>
      {tab !== 'log' && (
        <header className="app-bar">
          <div>
            <p className="brand">Gym Log</p>
            <p className="heaviest">{state.program.title}</p>
          </div>
          <span className={state.program.locked ? 'lock-pill on' : 'lock-pill'}>
            {state.program.locked ? 'Locked' : 'Unlocked'}
          </span>
        </header>
      )}

      {backupDue && (
        <div className="banner nudge">
          <p>Time to export a backup of your gym log.</p>
          <div className="banner-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                setTab('settings');
                requestAnimationFrame(() => {
                  document.getElementById('backup-export')?.scrollIntoView({ block: 'start' });
                });
              }}
            >
              Export
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => void dismissBackupNudge()}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <main className="main">
        {tab === 'log' && <LogScreen onNeedProgram={() => setTab('program')} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'program' && <ProgramScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      {restTimer && (
        <RestTimerDock
          timer={restTimer}
          activePreset={restPreset}
          onPreset={(seconds) => void bumpRestTimer(seconds)}
          onExtend30={() => void bumpRestTimer('extend30')}
          onDismiss={() => void setRestTimerDraft(null)}
        />
      )}

      <nav className="tab-bar" aria-label="Primary">
        <button
          type="button"
          className={tab === 'log' ? 'tab on' : 'tab'}
          onClick={() => setTab('log')}
        >
          Log
        </button>
        <button
          type="button"
          className={tab === 'history' ? 'tab on' : 'tab'}
          onClick={() => setTab('history')}
        >
          History
        </button>
        <button
          type="button"
          className={tab === 'program' ? 'tab on' : 'tab'}
          onClick={() => setTab('program')}
        >
          Program
        </button>
        <button
          type="button"
          className={tab === 'settings' ? 'tab on' : 'tab'}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </nav>
    </div>
  );
}
