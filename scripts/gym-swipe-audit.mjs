import { readFileSync, mkdirSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
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

async function pointerSwipe(page, locator, { dx, dy }) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('No bounding box for swipe target');
  const startX = box.x + box.width * 0.75;
  const startY = box.y + box.height / 2;
  const endX = startX + dx;
  const endY = startY + dy;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
}

async function main() {
  let browser;
  try {
    browser = await webkit.launch();
  } catch {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
  }

  const iphone13 = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iphone13,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
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
      results.push({ scenario: name, pass: true });
    } catch (err) {
      results.push({ scenario: name, pass: false, error: String(err) });
    }
  }

  const firstSwipeRow = () => page.locator('.set-swipe-row').first();

  await check('Partial swipe reveals Delete', async () => {
    await pointerSwipe(page, firstSwipeRow(), { dx: -50, dy: 0 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('.set-swipe-delete');
      const content = document.querySelector('.set-swipe-content');
      if (!btn || !content) return false;
      const transform = getComputedStyle(content).transform;
      return transform !== 'none';
    });
    await page.screenshot({ path: join(outDir, 'gym-swipe-reveal.png'), fullPage: false });
  });

  await check('Tap Delete removes set and Undo restores it', async () => {
    const countBefore = await page.locator('.set-swipe-row').count();
    await tap(page.getByRole('button', { name: 'Delete set' }).first());
    await page.waitForFunction(
      (n) => document.querySelectorAll('.set-swipe-row').length === n - 1,
      countBefore,
    );
    await page.waitForSelector('.undo-toast');
    await page.screenshot({ path: join(outDir, 'gym-swipe-undo.png'), fullPage: false });
    await tap(page.locator('.undo-toast-btn'));
    await page.waitForFunction(
      (n) => document.querySelectorAll('.set-swipe-row').length === n,
      countBefore,
    );
  });

  await check('Full swipe deletes set immediately', async () => {
    const countBefore = await page.locator('.set-swipe-row').count();
    await pointerSwipe(page, firstSwipeRow(), { dx: -280, dy: 0 });
    await page.waitForFunction(
      (n) => document.querySelectorAll('.set-swipe-row').length === n - 1,
      countBefore,
    );
    await tap(page.locator('.undo-toast-btn'));
  });

  await check('Vertical drag scrolls without revealing Delete', async () => {
    await page.evaluate(() => {
      const stack = document.querySelector('.log-stack');
      if (stack) stack.style.paddingBottom = '720px';
      const main = document.querySelector('.main');
      if (main) main.scrollTop = 0;
    });
    const main = page.locator('.main');
    const row = firstSwipeRow();
    await pointerSwipe(page, row, { dx: 3, dy: 110 });
    const revealed = await page.evaluate(() => {
      const content = document.querySelector('.set-swipe-content');
      if (!content) return false;
      const transform = getComputedStyle(content).transform;
      return transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    });
    if (revealed) throw new Error('Delete action revealed after vertical drag');
    const before = await main.evaluate((el) => el.scrollTop);
    await row.hover();
    await page.mouse.wheel(0, 140);
    await page.waitForFunction(
      (prev) => {
        const mainEl = document.querySelector('.main');
        return mainEl && mainEl.scrollTop > prev;
      },
      before,
    );
  });

  await check('Reps +1 stepper still works', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const card = page.locator('.hybrid-card.active-card').first();
    const repsBefore = await card.locator('.set-trow.current .set-val').nth(1).innerText();
    await tap(card.getByRole('button', { name: '+1', exact: true }));
    await page.waitForFunction(
      (prev) => {
        const row = document.querySelector('.hybrid-card.active-card .set-trow.current');
        if (!row) return false;
        const vals = row.querySelectorAll('.set-val');
        return vals[1] && vals[1].textContent !== prev;
      },
      repsBefore,
    );
  });

  writeFileSync(join(outDir, 'gym-swipe-audit.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));

  await context.close();
  await browser.close();

  const videos = readdirSync(outDir).filter((f) => f.endsWith('.webm') && f !== 'gym-swipe.webm');
  if (videos.length) {
    renameSync(join(outDir, videos[videos.length - 1]), join(outDir, 'gym-swipe.webm'));
  }
  try {
    execSync(
      `ffmpeg -y -i "${join(outDir, 'gym-swipe.webm')}" -vf "fps=12,scale=390:-1" "${join(outDir, 'gym-swipe.gif')}"`,
      { stdio: 'ignore' },
    );
  } catch {
    /* ffmpeg optional */
  }

  const failed = results.filter((r) => !r.pass);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
