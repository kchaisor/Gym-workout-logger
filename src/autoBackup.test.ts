import { describe, expect, it, vi } from 'vitest';
import { defaultBackupPrefs } from './backupPrefs';
import { serializeBackup } from './backup';
import {
  backupChangeFingerprint,
  buildAutoBackupUploadUrl,
  hashBackupState,
  maybeUploadAutoBackup,
  readAutoBackupConfig,
  readAutoBackupStatus,
  uploadAutoBackupPayload,
  writeAutoBackupConfig,
  AUTO_BACKUP_KEYS,
} from './autoBackup';
import type { GymState } from './types';

function minimalState(overrides: Partial<GymState> = {}): GymState {
  return {
    program: {
      id: 'p1',
      title: 'Test',
      locked: true,
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
    categories: [],
    programExercises: [],
    sessions: [],
    setEntries: [],
    exerciseNotes: [],
    prefs: defaultBackupPrefs(),
    ...overrides,
  };
}

describe('backupChangeFingerprint', () => {
  it('ignores exportedAt so unchanged data matches', () => {
    const state = minimalState();
    const a = serializeBackup(state);
    const b = { ...serializeBackup(state), exportedAt: '2099-01-01T00:00:00.000Z' };
    expect(backupChangeFingerprint(a)).toBe(backupChangeFingerprint(b));
  });

  it('changes when program data changes', () => {
    const state = minimalState();
    const changed = minimalState({
      program: { ...minimalState().program, title: 'Other' },
    });
    expect(backupChangeFingerprint(serializeBackup(state))).not.toBe(
      backupChangeFingerprint(serializeBackup(changed)),
    );
  });
});

describe('buildAutoBackupUploadUrl', () => {
  it('appends token query param', () => {
    expect(buildAutoBackupUploadUrl('https://example.com/exec', 'abc 123')).toBe(
      'https://example.com/exec?token=abc%20123',
    );
  });

  it('uses ampersand when url already has query', () => {
    expect(buildAutoBackupUploadUrl('https://example.com/exec?x=1', 't')).toBe(
      'https://example.com/exec?x=1&token=t',
    );
  });
});

describe('uploadAutoBackupPayload', () => {
  it('posts text/plain body without extra headers', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;

    const result = await uploadAutoBackupPayload(
      'https://example.com/save',
      'secret',
      '{"version":1}',
      fetchImpl,
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/save?token=secret', {
      method: 'POST',
      body: '{"version":1}',
      headers: { 'Content-Type': 'text/plain' },
    });
  });

  it('fails quietly on bad response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false }),
    })) as unknown as typeof fetch;

    const result = await uploadAutoBackupPayload('https://x.com', 't', '{}', fetchImpl);
    expect(result).toEqual({ ok: false, reason: 'Upload rejected' });
  });
});

describe('maybeUploadAutoBackup', () => {
  it('skips when endpoint or token missing', async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await maybeUploadAutoBackup(minimalState(), { storage, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips when hash matches last successful upload', async () => {
    const storage = memoryStorage();
    writeAutoBackupConfig(
      { endpointUrl: 'https://example.com/save', token: 'tok' },
      storage,
    );
    const state = minimalState();
    const hash = await hashBackupState(state);
    storage.setItem(AUTO_BACKUP_KEYS.lastHash, hash);

    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await maybeUploadAutoBackup(state, { storage, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uploads and records success when data changed', async () => {
    const storage = memoryStorage();
    writeAutoBackupConfig(
      { endpointUrl: 'https://example.com/save', token: 'tok' },
      storage,
    );
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;

    const fixedNow = () => new Date('2026-10-13T18:00:00.000Z');
    const state = minimalState({
      prefs: defaultBackupPrefs(0, new Date('2026-10-01T00:00:00.000Z')),
    });
    await maybeUploadAutoBackup(state, {
      storage,
      fetchImpl,
      now: fixedNow,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const status = readAutoBackupStatus(storage);
    expect(status.lastAt).toBe('2026-10-13T18:00:00.000Z');
    expect(status.lastError).toBeNull();
    const hash = await hashBackupState(state);
    expect(storage.getItem(AUTO_BACKUP_KEYS.lastHash)).toBe(hash);
  });

  it('records error and keeps old hash on failure', async () => {
    const storage = memoryStorage();
    writeAutoBackupConfig(
      { endpointUrl: 'https://example.com/save', token: 'tok' },
      storage,
    );
    storage.setItem(AUTO_BACKUP_KEYS.lastHash, 'previous-hash');

    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await maybeUploadAutoBackup(minimalState(), { storage, fetchImpl });

    expect(readAutoBackupStatus(storage).lastError).toBe('Network error');
    expect(storage.getItem(AUTO_BACKUP_KEYS.lastHash)).toBe('previous-hash');
  });
});

describe('readAutoBackupConfig', () => {
  it('round-trips via writeAutoBackupConfig', () => {
    const storage = memoryStorage();
    writeAutoBackupConfig({ endpointUrl: ' https://a.com ', token: ' x ' }, storage);
    expect(readAutoBackupConfig(storage)).toEqual({
      endpointUrl: 'https://a.com',
      token: 'x',
    });
  });
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}
