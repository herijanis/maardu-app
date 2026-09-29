// One-time manual eKool login: `node ekool/login.js`
// Opens a normal (not automation-controlled) Chrome with its own profile under data/, waits for the
// user to log in by hand, then saves the eKool cookies to data/ekool-session.json for ekool/fetch.js.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { saveSession, SESSION_FILE } from './session.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const PROFILE = new URL('../data/chrome-login/', import.meta.url).pathname;

async function connect() {
  try { return await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { return null; }
}

let browser = await connect();
if (!browser) {
  spawn(CHROME, [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-first-run',
    '--no-default-browser-check', 'https://login.ekool.eu/'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20 && !browser; i++) { await new Promise(r => setTimeout(r, 500)); browser = await connect(); }
  if (!browser) throw new Error('Could not start Chrome');
}

const ctx = browser.contexts()[0];
console.log('Log in to eKool in the Chrome window (waiting up to 15 min)...');
const deadline = Date.now() + 15 * 60_000;
let cookies = [];
while (Date.now() < deadline) {
  cookies = (await ctx.cookies()).filter(c => c.domain.endsWith('ekool.eu'));
  if (cookies.some(c => c.name === 'rt') && cookies.some(c => c.name === 'logged_in')) break;
  await new Promise(r => setTimeout(r, 2000));
}
if (!cookies.some(c => c.name === 'rt')) { console.error('Timed out waiting for login.'); process.exit(1); }

saveSession(cookies.map(({ name, value, domain, path, expires }) => ({ name, value, domain, path, expires })));
console.log(`Saved eKool session to ${SESSION_FILE}. You can close the Chrome window.`);
process.exit(0);
