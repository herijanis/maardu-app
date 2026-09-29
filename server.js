// Serves web/ and data/*.json on http://localhost:4411 and runs the fetchers at
// 07:00, 12:00 and 19:00 Europe/Tallinn (plus once on start). POST /api/refresh runs them now.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WEB = join(ROOT, 'web');
const DATA = join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 4411;
const TZ = 'Europe/Tallinn';
const SLOTS = ['07', '12', '19']; // hours, Tallinn time
const FETCHERS = [
  { name: 'timetable', script: join(ROOT, 'timetable', 'fetch.js') },
  { name: 'ekool', script: join(ROOT, 'ekool', 'fetch.js') },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

// --- fetchers ---
function runScript({ name, script }) {
  return new Promise((resolve) => {
    if (!existsSync(script)) {
      log(`${name}: ${script} not found, skipping`);
      return resolve({ name, ok: false, skipped: true });
    }
    const child = spawn(process.execPath, [script], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = (chunk) => chunk.toString().split('\n').filter(Boolean).forEach((l) => log(`[${name}] ${l}`));
    child.stdout.on('data', out);
    child.stderr.on('data', out);
    const timer = setTimeout(() => child.kill('SIGKILL'), 5 * 60_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ name, ok: code === 0, code }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ name, ok: false, error: String(err) }); });
  });
}

let running = null;
// One refresh at a time; the fetchers run one after another so they don't both write status.json at once.
function refresh(reason) {
  running ??= (async () => {
    log(`refresh (${reason})`);
    const results = [];
    for (const f of FETCHERS) results.push(await runScript(f));
    return results;
  })().finally(() => { running = null; });
  return running;
}

// --- scheduler ---
// "YYYY-MM-DD HH" wall-clock in Tallinn; lexicographic order == time order.
const tallinnHour = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}`;
};
function latestSlot(now) {
  const [day, hour] = tallinnHour(now).split(' ');
  const today = SLOTS.filter((h) => h <= hour).at(-1);
  if (today) return `${day} ${today}`;
  return `${tallinnHour(new Date(now - 24 * 3600_000)).split(' ')[0]} ${SLOTS.at(-1)}`;
}
let lastRun = '';
async function tick() {
  const slot = latestSlot(new Date());
  // Also catches up after the Mac was asleep through a slot.
  if (lastRun < slot) {
    lastRun = tallinnHour(new Date());
    await refresh(`scheduled ${slot}:00`);
  }
}

// --- http ---
function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, ...extra });
  res.end(body);
}
async function sendFile(res, file, extra = {}) {
  const body = await readFile(file);
  send(res, 200, body, TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', extra);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);

    if (path === '/api/refresh') {
      if (req.method !== 'POST') return send(res, 405, 'POST only', undefined, { Allow: 'POST' });
      const results = await refresh('api');
      let status = {};
      try { status = JSON.parse(await readFile(join(DATA, 'status.json'), 'utf8')); } catch {}
      return send(res, 200, JSON.stringify({ results, status }), TYPES['.json']);
    }

    const m = path.match(/^\/data\/([a-z0-9_-]+)\.json$/i);
    if (m) {
      const noStore = { 'Cache-Control': 'no-store' };
      for (const file of [join(DATA, `${m[1]}.json`), join(DATA, 'sample', `${m[1]}.json`)]) {
        if (existsSync(file)) return await sendFile(res, file, noStore);
      }
      return send(res, 404, 'not found');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    let file = normalize(join(WEB, path));
    if (file !== WEB && !file.startsWith(WEB + sep)) return send(res, 403, 'forbidden');
    if (existsSync(file) && (await stat(file)).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return send(res, 404, 'not found');
    return await sendFile(res, file);
  } catch (err) {
    log('request error', err);
    if (!res.headersSent) send(res, 500, 'server error');
    else res.end();
  }
});

server.listen(PORT, () => {
  log(`maardu-app on http://localhost:${PORT}`);
  lastRun = tallinnHour(new Date());
  refresh('startup');
  setInterval(tick, 60_000);
});
