// eKool homework fetcher: `npm run ekool` -> data/homework.json (contract v1).
// Uses the session saved by `node ekool/login.js` (data/ekool-session.json), renews the access token
// itself and reads homework from the family dashboard (DWR dashboardManager.getDashboardData).
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { subjectKey } from '../shared/subject.js';
import { loadSession, saveSession, cookieHeader, absorb } from './session.js';

const DATA = fileURLToPath(new URL('../data/', import.meta.url));
const TZ = 'Europe/Tallinn';
const LOGIN = 'https://login.ekool.eu';
const API = 'https://api-v2.ekool.eu';
const FAMILY = 'https://family.ekool.eu';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const DAYS_AHEAD = 7;
export const RELOGIN = 'eKool: logi uuesti sisse';

class ReloginError extends Error {
  constructor(detail) { super(RELOGIN); this.detail = detail; }
}

// --- dates (all in Europe/Tallinn) ---
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fromEe = (s) => { const [d, m, y] = s.split(' ')[0].split('.'); return `${y}-${m}-${d}`; }; // dd.MM.yyyy
function tallinnIso(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const off = p.timeZoneName.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

// --- http with cookie jar ---
function client(jar) {
  return async function request(url, { method = 'GET', body, headers = {} } = {}) {
    const xsrf = jar.find((c) => c.name === 'XSRF-TOKEN');
    const res = await fetch(url, {
      method, body, redirect: 'manual',
      headers: {
        'user-agent': UA, accept: 'application/json', origin: 'https://web.ekool.eu', referer: 'https://web.ekool.eu/',
        ...(xsrf ? { 'x-xsrf-token': decodeURIComponent(xsrf.value) } : {}),
        cookie: cookieHeader(jar, url), ...headers,
      },
    });
    absorb(jar, res, url);
    return res;
  };
}

// Access token ("at") lives ~1h; renew it when it has less than 10 min left.
async function ensureFresh(request) {
  const res = await request(`${LOGIN}/auth/token-expire-time`);
  const json = res.ok ? await res.json().catch(() => null) : null;
  const expire = json?.success ? json.data.expire : 0;
  if (expire - Date.now() / 1000 > 600) return;
  const r = await request(`${LOGIN}/auth/refresh-token-cookies`, {
    method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
  });
  const ok = r.ok && (await r.json().catch(() => null))?.success;
  if (!ok) throw new ReloginError(`token refresh failed: HTTP ${r.status}`);
}

// --- DWR ---
// Replies are JavaScript; run them in an empty vm context with stub dwr/model objects and pull out the result.
function parseDwr(text) {
  let result, error;
  const anyPath = () => new Proxy(function () {}, { get: (t, k) => (k === 'prototype' ? {} : anyPath()), construct: () => ({}) });
  const remote = {
    handleCallback: (_b, _c, data) => { result = data; },
    handleException: (_b, _c, ex) => { error = ex; },
    handleBatchException: (ex) => { error = ex; },
    newObject: (_cls, obj) => obj,
  };
  const context = vm.createContext({ window: { dwr: { _: [{ engine: { remote } }] } }, ee: anyPath(), Date },
    { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(text, context, { timeout: 2000 });
  if (error) {
    if (/NO_SESSION|LOGIN/i.test(error.message ?? '')) throw new ReloginError(`DWR ${error.message}`);
    throw new Error(`eKool DWR error: ${error.message ?? JSON.stringify(error)}`);
  }
  if (!result) throw new Error('eKool DWR: no reply');
  if (result.isError) throw new Error(`eKool DWR: ${JSON.stringify(result.errors).slice(0, 200)}`);
  return result.returnObject;
}

const dwrParam = (v) => (v === null ? 'null:null' : typeof v === 'boolean' ? `boolean:${v}` : `number:${v}`);
async function dwr(request, script, method, params) {
  const body = [
    'callCount=1', 'nextReverseAjaxIndex=0', `c0-scriptName=${script}`, `c0-methodName=${method}`, 'c0-id=0',
    ...params.map((p, i) => `c0-param${i}=${dwrParam(p)}`),
    'batchId=1', 'instanceId=0', 'page=%2Findex_et.html', 'scriptSessionId=',
  ].join('\n');
  const res = await request(`${FAMILY}/dwr/call/plaincall/${script}.${method}.dwr`, {
    method: 'POST', body,
    headers: { 'content-type': 'text/plain', accept: '*/*', origin: FAMILY, referer: `${FAMILY}/index_et.html` },
  });
  if (!res.ok) throw new Error(`eKool DWR ${method}: HTTP ${res.status}`);
  return parseDwr(await res.text());
}

// --- homework ---
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—',
  auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', otilde: 'õ', Otilde: 'Õ', scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž' };
function htmlToText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ENTITIES[e] ?? m))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toItem(t) {
  const subject = t.subjectName ?? '';
  return {
    id: `ekool-${t.id}`,
    date: fromEe(t.deadline),
    subject,
    subjectKey: subjectKey(subject),
    period: null, // eKool todos are not tied to a lesson number
    type: t.isTest ? 'test' : 'homework',
    title: (t.name ?? '').trim() || subject,
    description: htmlToText(t.content),
    done: null, // the dashboard does not say whether the student marked it done
    url: null,
  };
}

export async function fetchHomework(now = new Date()) {
  const jar = loadSession();
  if (!jar) throw new ReloginError('no saved session (run: node ekool/login.js)');
  const request = client(jar);
  try {
    await ensureFresh(request);
    const me = await request(`${API}/user/me/basic`);
    if (me.status === 401) throw new ReloginError('api-v2 401');
    if (!me.ok) throw new Error(`eKool user/me/basic: HTTP ${me.status}`);
    const personId = (await me.json()).data.id;

    const dash = await dwr(request, 'dashboardManager', 'getDashboardData', [personId, 0, null, null, false, false]);
    const todos = Object.values(dash.todoSummaryMap ?? {}).flat();

    const from = ymd(now), to = addDays(from, DAYS_AHEAD);
    const items = todos.filter((t) => t?.deadline).map(toItem)
      .filter((i) => i.date >= from && i.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));
    return { fetchedAt: tallinnIso(now), items };
  } finally {
    saveSession(jar); // keep rotated tokens even if a later step failed
  }
}

async function writeJson(file, obj) {
  await mkdir(DATA, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2) + '\n');
  await rename(tmp, file);
}
async function setStatus(entry) {
  const file = join(DATA, 'status.json');
  let status = {};
  try { status = JSON.parse(await readFile(file, 'utf8')); } catch {}
  status.ekool = entry;
  await writeJson(file, status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const hw = await fetchHomework();
    await writeJson(join(DATA, 'homework.json'), hw);
    await setStatus({ ok: true, at: tallinnIso() });
    console.log(`ekool: ${hw.items.length} items${hw.items.length ? ` ${hw.items[0].date}..${hw.items.at(-1).date}` : ''}`);
  } catch (err) {
    await setStatus({ ok: false, at: tallinnIso(), error: String(err?.message ?? err) });
    console.error('ekool fetch failed:', err?.detail ?? '', err);
    process.exit(1);
  }
}
