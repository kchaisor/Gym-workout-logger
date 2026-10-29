import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

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

async function main() {
  const browser = await chromium.launch();
  const iphone = devices['iPhone 12'];
  const context = await browser.newContext({
    ...iphone,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  await seedPage(page, {
    logDraft: { ...demoState.logDraft, restTimer: null },
  });
  await page.waitForSelector('.log-screen');
  await page.screenshot({ path: join(outDir, 'gym-log-hybrid.png'), fullPage: true });

  const editState = {
    ...demoState,
    logDraft: {
      ...demoState.logDraft,
      restTimer: {
        ...demoState.logDraft.restTimer,
        endsAtMs: Date.now() + 134_000,
      },
    },
  };
  await seedPage(page, editState);
  await page.waitForSelector('.rest-dock');
  await page.locator('.set-chk.on').first().click();
  await page.waitForSelector('.set-trow.editing');
  await page.screenshot({ path: join(outDir, 'gym-log-rest-edit.png'), fullPage: true });

  await browser.close();
  console.log('Saved screenshots to', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
