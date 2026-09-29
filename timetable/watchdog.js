// Watchdog (runs every 3h in GitHub Actions): checks the LIVE site, not the workflow's own state, so a broken
// deploy is caught too. The newest good time is the live timetable.json's fetchedAt, if that file is valid.
//
// node timetable/watchdog.js <site url>
import { fileURLToPath } from 'node:url';
import { validate } from './validate.js';
import { alarm } from './alarm.js';

export async function checkSite(site, { fetchImpl = fetch } = {}) {
  const errors = [];
  const get = async (name) => {
    try {
      const res = await fetchImpl(`${site}/data/${name}?t=${Date.now()}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
      return null;
    }
  };
  const [tt, status] = await Promise.all([get('timetable.json'), get('status.json')]);
  let lastOk = null;
  if (tt) {
    const problems = validate(tt);
    if (problems.length) errors.push(`live timetable.json is invalid: ${problems.join('; ')}`);
    else lastOk = tt.fetchedAt;
  }
  if (status?.timetable?.error) errors.push(`last fetch error: ${status.timetable.error}`);
  return { lastOk, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = (process.argv[2] ?? '').replace(/\/$/, '');
  const checked = await checkSite(site);
  // Test hook (watchdog workflow input fake_last_ok): pretend the live data is this old.
  const lastOk = process.env.FAKE_LAST_OK || checked.lastOk;
  const errors = process.env.FAKE_LAST_OK ? [...checked.errors, `TEST: lastOk faked as ${lastOk}`] : checked.errors;
  console.log(`live ${site}: lastOk ${lastOk ?? 'none'}${errors.length ? `, errors: ${errors.join(' | ')}` : ''}`);
  alarm({ lastOk, errors: errors.join('\n'), context: `watchdog, ${site}` });
}
