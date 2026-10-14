import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUTO_BACKUP_UPDATED_EVENT,
  readAutoBackupConfig,
  readAutoBackupStatus,
  writeAutoBackupConfig,
  type AutoBackupStatus,
} from './autoBackup';
import { backupFilename } from './backup';
import { DEFAULT_AFTER_SESSIONS, DEFAULT_EVERY_DAYS } from './backupPrefs';
import { useGym } from './store';

function parseCount(raw: string, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return fallback;
  return Math.min(max, value);
}

function formatLastBackup(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

export function SettingsScreen() {
  const { exportBackup, importBackup, state, setBackupPrefs } = useGym();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [daysDraft, setDaysDraft] = useState(String(state?.prefs.everyDays ?? DEFAULT_EVERY_DAYS));
  const [sessionsDraft, setSessionsDraft] = useState(
    String(state?.prefs.afterSessions ?? DEFAULT_AFTER_SESSIONS),
  );
  const [endpointDraft, setEndpointDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [autoStatus, setAutoStatus] = useState<AutoBackupStatus>(() => readAutoBackupStatus());

  const refreshAutoStatus = useCallback(() => {
    setAutoStatus(readAutoBackupStatus());
  }, []);

  useEffect(() => {
    const config = readAutoBackupConfig();
    setEndpointDraft(config.endpointUrl);
    setTokenDraft(config.token);
    refreshAutoStatus();
  }, [refreshAutoStatus]);

  useEffect(() => {
    window.addEventListener(AUTO_BACKUP_UPDATED_EVENT, refreshAutoStatus);
    return () => window.removeEventListener(AUTO_BACKUP_UPDATED_EVENT, refreshAutoStatus);
  }, [refreshAutoStatus]);

  useEffect(() => {
    if (!state) return;
    setDaysDraft(String(state.prefs.everyDays));
    setSessionsDraft(String(state.prefs.afterSessions));
  }, [state?.prefs.afterSessions, state?.prefs.everyDays]);

  async function downloadBackupJson(json: string) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFilename();
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function onExport() {
    setStatus(null);
    try {
      const json = await exportBackup();
      await downloadBackupJson(json);
      setStatus('Backup downloaded.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Export failed');
    }
  }

  async function onShareBackup() {
    setStatus(null);
    try {
      const json = await exportBackup();
      const name = backupFilename();
      const file = new File([json], name, { type: 'application/json' });
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[] }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file] });
        setStatus('Backup shared.');
        return;
      }
      await downloadBackupJson(json);
      setStatus('Backup downloaded.');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setStatus(err instanceof Error ? err.message : 'Share failed');
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setStatus(null);
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      if (
        !window.confirm(
          'Replace everything on this phone with the backup? This cannot be undone.',
        )
      ) {
        return;
      }
      await importBackup(raw);
      setStatus('Restored from backup.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function saveDays() {
    if (!state) return;
    const next = parseCount(daysDraft, state.prefs.everyDays, 365);
    setDaysDraft(String(next));
    if (next !== state.prefs.everyDays) await setBackupPrefs({ everyDays: next });
  }

  async function saveSessions() {
    if (!state) return;
    const next = parseCount(sessionsDraft, state.prefs.afterSessions, 99);
    setSessionsDraft(String(next));
    if (next !== state.prefs.afterSessions) await setBackupPrefs({ afterSessions: next });
  }

  function saveAutoBackupConfig() {
    writeAutoBackupConfig({ endpointUrl: endpointDraft, token: tokenDraft });
    refreshAutoStatus();
  }

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">This device</p>
          <h2>Settings</h2>
        </div>
      </header>

      <article className="card" id="backup-export">
        <h3>Backup</h3>
        <p className="muted">
          Full JSON of program, sessions, and sets. Stored in IndexedDB until you export.
        </p>
        <div className="btn-col">
          <button className="btn primary" type="button" onClick={() => void onExport()}>
            Export JSON
          </button>
          <button className="btn ghost" type="button" onClick={() => void onShareBackup()}>
            Share backup
          </button>
          <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>
            Import / restore
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void onPickFile(event.target.files?.[0])}
          />
        </div>
        {status && <p className="banner-note">{status}</p>}
      </article>

      <article className="card">
        <h3>Auto-backup</h3>
        <p className="muted">
          After a session ends, when the app opens, or when you come back online — uploads changed
          data to your Apps Script endpoint (text/plain POST, token in query string).
        </p>
        <label className="stack-label">
          <span>Endpoint URL</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://script.google.com/macros/s/…/exec"
            value={endpointDraft}
            onChange={(event) => setEndpointDraft(event.target.value)}
            onBlur={saveAutoBackupConfig}
            aria-label="Auto-backup endpoint URL"
          />
        </label>
        <label className="stack-label">
          <span>Token</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="Shared secret"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            onBlur={saveAutoBackupConfig}
            aria-label="Auto-backup token"
          />
        </label>
        <p className="heaviest">Last backup: {formatLastBackup(autoStatus.lastAt)}</p>
        {autoStatus.lastError && (
          <p className="subtle-error" role="status">
            Last attempt: {autoStatus.lastError}
          </p>
        )}
      </article>

      <article className="card">
        <h3>Backup reminder</h3>
        <p className="muted">
          Gentle nudge to export — whichever comes first. Default is {DEFAULT_EVERY_DAYS} days or{' '}
          {DEFAULT_AFTER_SESSIONS} sessions.
        </p>
        <label className="toggle-row">
          <span>Remind me to export</span>
          <input
            type="checkbox"
            checked={state?.prefs.remindEnabled ?? true}
            onChange={(event) => void setBackupPrefs({ remindEnabled: event.target.checked })}
          />
        </label>
        <div className="prefs-grid">
          <label>
            <span>Every N days</span>
            <input
              inputMode="numeric"
              value={daysDraft}
              onChange={(event) => setDaysDraft(event.target.value)}
              onBlur={() => void saveDays()}
              aria-label="Remind every N days"
            />
          </label>
          <label>
            <span>After N sessions</span>
            <input
              inputMode="numeric"
              value={sessionsDraft}
              onChange={(event) => setSessionsDraft(event.target.value)}
              onBlur={() => void saveSessions()}
              aria-label="Remind after N sessions"
            />
          </label>
        </div>
        <p className="heaviest">Set a field to 0 to ignore that trigger.</p>
      </article>

      <article className="card">
        <h3>About</h3>
        <p className="muted">
          Local-first gym logger. No accounts, no cloud. History stays on this phone. Add to Home
          Screen from Safari for the PWA.
        </p>
        {state && (
          <p className="heaviest">
            {state.program.title} · {state.setEntries.length} sets · updated{' '}
            {new Date(state.program.updatedAt).toLocaleDateString()}
          </p>
        )}
      </article>
    </section>
  );
}
