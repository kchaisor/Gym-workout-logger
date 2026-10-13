import { serializeBackup } from './backup';
import type { BackupPayload, GymState } from './types';

export const AUTO_BACKUP_KEYS = {
  endpointUrl: 'gym.autoBackup.endpointUrl',
  token: 'gym.autoBackup.token',
  lastHash: 'gym.autoBackup.lastHash',
  lastAt: 'gym.autoBackup.lastAt',
  lastError: 'gym.autoBackup.lastError',
} as const;

export const AUTO_BACKUP_UPDATED_EVENT = 'gym-auto-backup-updated';

export type AutoBackupConfig = {
  endpointUrl: string;
  token: string;
};

export type AutoBackupStatus = {
  lastAt: string | null;
  lastError: string | null;
};

let uploadInFlight: Promise<void> | null = null;

function dispatchStatusUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTO_BACKUP_UPDATED_EVENT));
  }
}

export function readAutoBackupConfig(storage: Storage = localStorage): AutoBackupConfig {
  return {
    endpointUrl: storage.getItem(AUTO_BACKUP_KEYS.endpointUrl)?.trim() ?? '',
    token: storage.getItem(AUTO_BACKUP_KEYS.token)?.trim() ?? '',
  };
}

export function writeAutoBackupConfig(
  config: AutoBackupConfig,
  storage: Storage = localStorage,
): void {
  const url = config.endpointUrl.trim();
  const token = config.token.trim();
  if (url) storage.setItem(AUTO_BACKUP_KEYS.endpointUrl, url);
  else storage.removeItem(AUTO_BACKUP_KEYS.endpointUrl);
  if (token) storage.setItem(AUTO_BACKUP_KEYS.token, token);
  else storage.removeItem(AUTO_BACKUP_KEYS.token);
}

export function readAutoBackupStatus(storage: Storage = localStorage): AutoBackupStatus {
  return {
    lastAt: storage.getItem(AUTO_BACKUP_KEYS.lastAt),
    lastError: storage.getItem(AUTO_BACKUP_KEYS.lastError),
  };
}

function readLastUploadedHash(storage: Storage): string | null {
  return storage.getItem(AUTO_BACKUP_KEYS.lastHash);
}

function recordUploadSuccess(hash: string, at: string, storage: Storage): void {
  storage.setItem(AUTO_BACKUP_KEYS.lastHash, hash);
  storage.setItem(AUTO_BACKUP_KEYS.lastAt, at);
  storage.removeItem(AUTO_BACKUP_KEYS.lastError);
  dispatchStatusUpdated();
}

function recordUploadFailure(message: string, storage: Storage): void {
  storage.setItem(AUTO_BACKUP_KEYS.lastError, message);
  dispatchStatusUpdated();
}

/** Stable fingerprint of backup payload (exportedAt changes every serialize). */
export function backupChangeFingerprint(payload: BackupPayload): string {
  const { exportedAt: _exportedAt, ...data } = payload;
  return JSON.stringify(data);
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashBackupState(state: GymState): Promise<string> {
  const payload = serializeBackup(state);
  return sha256Hex(backupChangeFingerprint(payload));
}

export function buildAutoBackupUploadUrl(endpointUrl: string, token: string): string {
  const base = endpointUrl.trim();
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}token=${encodeURIComponent(token.trim())}`;
}

export type AutoBackupUploadResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function uploadAutoBackupPayload(
  endpointUrl: string,
  token: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AutoBackupUploadResult> {
  if (!endpointUrl.trim() || !token.trim()) {
    return { ok: false, reason: 'Missing endpoint or token' };
  }
  try {
    const response = await fetchImpl(buildAutoBackupUploadUrl(endpointUrl, token), {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain' },
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return { ok: false, reason: 'Invalid response' };
    }
    if (
      !response.ok ||
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { ok?: unknown }).ok !== true
    ) {
      return { ok: false, reason: 'Upload rejected' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Network error' };
  }
}

export async function maybeUploadAutoBackup(
  state: GymState,
  deps: {
    storage?: Storage;
    fetchImpl?: typeof fetch;
    now?: () => Date;
  } = {},
): Promise<void> {
  const storage = deps.storage ?? localStorage;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());

  const { endpointUrl, token } = readAutoBackupConfig(storage);
  if (!endpointUrl || !token) return;

  const hash = await hashBackupState(state);
  if (hash === readLastUploadedHash(storage)) return;

  if (uploadInFlight) {
    await uploadInFlight;
    return;
  }

  uploadInFlight = (async () => {
    const body = JSON.stringify(serializeBackup(state));
    const result = await uploadAutoBackupPayload(endpointUrl, token, body, fetchImpl);
    if (result.ok) {
      recordUploadSuccess(hash, now().toISOString(), storage);
    } else {
      recordUploadFailure(result.reason, storage);
    }
  })();

  try {
    await uploadInFlight;
  } finally {
    uploadInFlight = null;
  }
}
