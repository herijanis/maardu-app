// Serves web/ plus data/timetable.json and data/status.json on http://localhost:4411 (the same layout as
// the GitHub Pages site) and runs the timetable fetcher at 07:00, 12:00 and 19:00 Europe/Tallinn (plus once
// on start). It is exposed publicly, so it serves nothing outside that allow-list.
import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WEB = join(ROOT, 'web');
const WEB_REAL = await realpath(WEB).catch(() => WEB);
const DATA = join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 4411;
const TZ = 'Europe/Tallinn';
const SLOTS = ['07', '12', '19']; // hours, Tallinn time
const FETCHERS = [
  { name: 'timetable', script: join(ROOT, 'timetable', 'fetch.js') },
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
// One refresh at a time.
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
// Public (served through a tunnel): only web/ and an explicit allow-list of data files.
const DATA_FILES = {
  '/data/timetable.json': [join(DATA, 'timetable.json'), join(DATA, 'sample', 'timetable.json')],
  '/data/status.json': [join(DATA, 'status.json')],
  '/data/sample/timetable.json': [join(DATA, 'sample', 'timetable.json')],
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function cacheControl(file) {
  const ext = extname(file).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff2'].includes(ext)) return 'public, max-age=604800';
  if (['.js', '.mjs', '.css'].includes(ext)) return 'public, max-age=300';
  return 'no-cache'; // html, json, manifest: always revalidate
}

function send(req, res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS, ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
}
async function sendFile(req, res, file) {
  const st = await stat(file);
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cacheControl(file),
    ETag: etag,
    'Last-Modified': st.mtime.toUTCString(),
  };
  if (req.headers['if-none-match'] === etag) return send(req, res, 304, undefined, headers);
  send(req, res, 200, await readFile(file), headers);
}
// Resolves a URL path to a file inside web/, or null. No dotfiles, no escaping web/ (incl. via symlinks).
async function webFile(path) {
  if (path.split('/').some((seg) => seg.startsWith('.'))) return null;
  let file = normalize(join(WEB, path));
  if (file !== WEB && !file.startsWith(WEB + sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const real = await realpath(file);
    if (!real.startsWith(WEB_REAL + sep) || !(await stat(real)).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'method not allowed', { Allow: 'GET, HEAD' });
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(req, res, 400, 'bad request'); }
    if (path.includes('\0')) return send(req, res, 400, 'bad request');

    if (path.startsWith('/data/')) {
      const file = (DATA_FILES[path] ?? []).find((f) => existsSync(f));
      return file ? await sendFile(req, res, file) : send(req, res, 404, 'not found');
    }

    const file = await webFile(path);
    return file ? await sendFile(req, res, file) : send(req, res, 404, 'not found');
  } catch (err) {
    log('request error', err);
    if (!res.headersSent) send(req, res, 500, 'server error');
    else res.end();
  }
});

server.listen(PORT, () => {
  log(`maardu-app on http://localhost:${PORT}`);
  lastRun = tallinnHour(new Date());
  refresh('startup');
  setInterval(tick, 60_000);
});
