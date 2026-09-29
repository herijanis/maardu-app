// `npm run timetable`: fetches the 11.erh timetable from EduPage (edupage.js), parses it (parse.js), validates it
// (validate.js) and writes data/timetable.json. A failed or invalid fetch keeps the last good file.
// Always writes data/status.json: { timetable: { ok, at, error?, lastOk, source } }.
//
// Env: FETCH_BUDGET_MS (retry with backoff for this long, default 4 min), TIMETABLE_SOURCE (default "mac").
// `node timetable/fetch.js --save-fixture <dir>` also saves the raw EduPage download for parser tests.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchRaw } from './edupage.js';
import { parse } from './parse.js';
import { validate } from './validate.js';
import { tallinnIso } from './time.js';

const CLASS_NAME = process.env.TIMETABLE_CLASS || '11.erh';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

export async function fetchTimetable({ now = new Date(), className = CLASS_NAME, onRaw } = {}) {
  const raw = await fetchRaw({ className, now });
  await onRaw?.(raw);
  const tt = parse(raw);
  const errors = validate(tt, { className });
  if (errors.length) throw new Error(`invalid timetable: ${errors.join('; ')}`);
  return tt;
}

// Retries the whole fetch with backoff (5s, 10s, 20s, 40s, 60s, 60s…) until the budget runs out.
export async function withRetry(fn, { budgetMs, log = console.warn, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const deadline = Date.now() + budgetMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const wait = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
      // Validation errors won't fix themselves by retrying.
      if (/^invalid timetable/.test(err.message) || Date.now() + wait > deadline) throw err;
      log(`attempt ${attempt} failed (${errorText(err)}), retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

export const errorText = (err) => [err?.message, err?.cause?.code].filter(Boolean).join(' ') || String(err);

async function writeJson(file, obj) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2) + '\n');
  await rename(tmp, file);
}
const readJson = async (file) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; } };

async function setStatus(entry) {
  const file = join(DATA, 'status.json');
  const status = (await readJson(file)) ?? {};
  status.timetable = entry;
  await writeJson(file, status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixtureDir = process.argv.includes('--save-fixture') ? process.argv[process.argv.indexOf('--save-fixture') + 1] : null;
  const source = process.env.TIMETABLE_SOURCE || 'mac';
  const budgetMs = Number(process.env.FETCH_BUDGET_MS ?? 240_000);
  try {
    const tt = await withRetry(() => fetchTimetable({
      onRaw: fixtureDir && ((raw) => writeJson(join(fixtureDir, 'raw.json'), raw)),
    }), { budgetMs });
    await writeJson(join(DATA, 'timetable.json'), tt);
    await setStatus({ ok: true, at: tallinnIso(), lastOk: tt.fetchedAt, source });
    console.log(`timetable: ${tt.lessons.length} lessons ${tt.from}..${tt.to}`);
  } catch (err) {
    const last = await readJson(join(DATA, 'timetable.json'));
    await setStatus({ ok: false, at: tallinnIso(), error: errorText(err), lastOk: last?.fetchedAt ?? null, source });
    console.error('timetable fetch failed:', err);
    process.exit(1);
  }
}
