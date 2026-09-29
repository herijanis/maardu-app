// Cookie jar for the eKool session, persisted in data/ekool-session.json (gitignored).
import fs from 'node:fs';

export const SESSION_FILE = new URL('../data/ekool-session.json', import.meta.url).pathname;

export function loadSession() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).cookies; } catch { return null; }
}

export function saveSession(cookies) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ savedAt: new Date().toISOString(), cookies }, null, 1), { mode: 0o600 });
}

function domainMatches(host, domain) {
  const d = domain.replace(/^\./, '');
  return host === d || host.endsWith('.' + d);
}

export function cookieHeader(cookies, url) {
  const { hostname } = new URL(url);
  const now = Date.now() / 1000;
  return cookies
    .filter(c => domainMatches(hostname, c.domain) && (c.expires === -1 || c.expires > now))
    .map(c => `${c.name}=${c.value}`).join('; ');
}

// Apply Set-Cookie headers from a response to the jar.
export function absorb(cookies, res, url) {
  const host = new URL(url).hostname;
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';').map(s => s.trim());
    const i = pair.indexOf('=');
    const name = pair.slice(0, i), value = pair.slice(i + 1);
    let domain = host, path = '/', expires = -1;
    for (const a of attrs) {
      const [k, v] = a.split('=');
      const key = k.toLowerCase();
      if (key === 'domain') domain = v.startsWith('.') ? v : '.' + v;
      else if (key === 'path') path = v;
      else if (key === 'max-age') expires = Date.now() / 1000 + Number(v);
      else if (key === 'expires' && expires === -1) expires = Date.parse(v) / 1000;
    }
    const idx = cookies.findIndex(c => c.name === name && c.domain.replace(/^\./, '') === domain.replace(/^\./, ''));
    const deleted = expires !== -1 && expires < Date.now() / 1000;
    if (idx >= 0) cookies.splice(idx, 1);
    if (!deleted) cookies.push({ name, value, domain, path, expires });
  }
}
