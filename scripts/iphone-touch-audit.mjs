import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit, devices } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const demoState = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/hybrid-demo-state.json'), 'utf8'),
);

const baseUrl = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173/Gym-workout-logger/';
const outDir = '/opt/cursor/artifacts';
mkdirSync(outDir, { recursive: true });

async function seedPage(page, statePatch = {}) {
  const state = { ...demoState, ...statePatch };
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(async (payload) => {
    const DB_NAME = 'gym-workout-logger';
    const DB_VERSION = 1;
    const STATE_KEY = 'state';
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(payload, STATE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve(undefined);
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, state);
  await page.reload({ waitUntil: 'networkidle' });
}

async function tap(locator) {
  await locator.tap();
}

async function expectChangedReps(page, before) {
  await page.waitForFunction(
    (prev) => {
      const row = document.querySelector('.set-trow.current');
      if (!row) return false;
      const vals = row.querySelectorAll('.set-val');
      return vals[1] && vals[1].textContent !== prev;
    },
    before,
  );
}

async function expectChangedKg(page, before) {
  await page.waitForFunction(
    (prev) => {
      const row = document.querySelector('.set-trow.current');
      if (!row) return false;
      const vals = row.querySelectorAll('.set-val');
      return vals[0] && vals[0].textContent !== prev;
    },
    before,
  );
}

async function main() {
  const browser = await webkit.launch();
  const iphone13 = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iphone13,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.dismiss());

  await seedPage(page, {
    logDraft: {
      ...demoState.logDraft,
      restTimer: {
        ...demoState.logDraft.restTimer,
        endsAtMs: Date.now() + 180_000,
      },
    },
  });
  await page.waitForSelector('.log-screen');

  const results = [];

  async function check(name, fn) {
    try {
      await fn();
      results.push({ control: name, pass: true });
    } catch (err) {
      results.push({ control: name, pass: false, error: String(err) });
    }
  }

  await check('Log date pill', async () => {
    await tap(page.locator('.log-date-pill'));
  });

  await check('Split day tab (Leg day)', async () => {
    await tap(page.getByRole('tab', { name: /Leg day/i }));
    await page.waitForSelector('text=No exercises on this day');
  });

  await check('Split day tab (Upper body)', async () => {
    await tap(page.getByRole('tab', { name: /Upper body/i }));
  });

  await check('Reps −1 stepper', async () => {
    const card = page.locator('.hybrid-card.active-card').first();
    await tap(card.getByRole('button', { name: '−1', exact: true }));
  });

  await check('Reps +1 stepper', async () => {
    const card = page.locator('.hybrid-card.active-card').first();
    const repsBefore = await card.locator('.set-trow.current .set-val').nth(1).innerText();
    await tap(card.getByRole('button', { name: '+1', exact: true }));
    await expectChangedReps(page, repsBefore);
  });

  await check('kg −2.5 stepper', async () => {
    const card = page.locator('.hybrid-card.active-card').first();
    await tap(card.getByRole('button', { name: '−2.5' }));
  });

  await check('kg +2.5 stepper', async () => {
    const card = page.locator('.hybrid-card.active-card').first();
    const kgBefore = await card.locator('.set-trow.current .set-val').first().innerText();
    await tap(card.getByRole('button', { name: '+2.5' }));
    await expectChangedKg(page, kgBefore);
  });

  await check('kg +5 stepper', async () => {
    const card = page.locator('.hybrid-card.active-card').first();
    await tap(card.getByRole('button', { name: '+5', exact: true }));
  });

  await check('+Set row', async () => {
    const card = page.locator('.hybrid-card.active-card').first();
    const rowsBefore = await card.locator('.set-trow').count();
    await tap(card.getByRole('button', { name: '+Set' }));
    await page.waitForFunction(
      (n) => document.querySelectorAll('.hybrid-card.active-card .set-trow').length > n,
      rowsBefore,
    );
  });

  await check('Note Edit chip', async () => {
    await tap(page.locator('.note-edit-btn').first());
    await page.waitForSelector('.note-chip .inline-note');
  });

  await check('End session button visible', async () => {
    await page.waitForSelector('.log-end-btn');
  });

  await page.screenshot({ path: join(outDir, 'gym-fix-log.png'), fullPage: false });

  await check('Log set check (current row)', async () => {
    const card = page.locator('.hybrid-card.active-card').first();
    await tap(card.locator('.set-chk.ready'));
  });

  await check('Tap logged set → edit', async () => {
    await tap(page.locator('.set-chk.on').first());
    await page.waitForSelector('.set-trow.editing');
    await page.screenshot({ path: join(outDir, 'gym-fix-edit.png'), fullPage: false });
  });

  await check('Undo edit', async () => {
    await tap(page.getByRole('button', { name: 'Undo' }));
    await page.waitForSelector('.set-trow.editing', { state: 'detached' });
  });

  await check('Delete set', async () => {
    const countBefore = await page.locator('.set-chk.on').count();
    await tap(page.locator('.set-chk.on').first());
    await page.waitForSelector('.set-trow.editing');
    await tap(page.getByRole('button', { name: 'Delete' }));
    await page.waitForFunction(
      (n) => document.querySelectorAll('.set-chk.on').length === n - 1,
      countBefore,
    );
  });

  await check('Rest dock 2m preset', async () => {
    await tap(page.getByRole('button', { name: '2m', exact: true }));
  });

  await check('Rest dock 3m preset', async () => {
    await tap(page.getByRole('button', { name: '3m', exact: true }));
  });

  await check('Rest dock 5m preset', async () => {
    await tap(page.getByRole('button', { name: '5m', exact: true }));
  });

  await check('Rest dock +30s', async () => {
    await tap(page.getByRole('button', { name: '+30s' }));
  });

  await check('Rest dock dismiss', async () => {
    await tap(page.getByLabel('Dismiss rest'));
  });

  await check('Tab History', async () => {
    await tap(page.getByRole('button', { name: 'History', exact: true }));
    await page.waitForSelector('.history-item');
  });

  await check('Tab Program', async () => {
    await tap(page.getByRole('button', { name: 'Program', exact: true }));
  });

  await check('Tab Settings', async () => {
    await tap(page.getByRole('button', { name: 'Settings', exact: true }));
    await page.waitForSelector('#backup-export');
  });

  await check('Settings export backup button', async () => {
    await tap(page.locator('#backup-export'));
  });

  writeFileSync(join(outDir, 'iphone-touch-audit.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => !r.pass);
  await browser.close();
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
