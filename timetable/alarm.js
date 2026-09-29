// Alarm: keeps at most one open GitHub issue "Tunniplaan ei uuene" while the timetable is stale.
// Opens it (mentioning the owner, so they get an email) when there has been no successful fetch for 12h,
// comments and closes it on recovery. Uses the gh CLI (GH_TOKEN, GH_REPO).
//
// node timetable/alarm.js --last-ok <iso|''> [--errors "text"] [--context "where this ran"]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { latestSlot, tallinnIso } from './time.js';

export const TITLE = 'Tunniplaan ei uuene';
export const LABEL = 'tunniplaan-alarm';
export const STALE_HOURS = 12;
const HOUR = 3600_000;
const RETRY_WINDOW = 2.5 * HOUR; // Actions keeps retrying for ~2h after each slot

// Stale = no success for 12h, counted once the current slot's retries are over, so the normal 19:00→07:00
// overnight gap (exactly 12h) doesn't fire the alarm while the 07:00 retries are still running.
export function isStale(lastOk, now = new Date()) {
  const t = Date.parse(lastOk ?? '');
  if (isNaN(t)) return true;
  const age = now - t;
  if (age > STALE_HOURS * HOUR + RETRY_WINDOW) return true;
  return age > STALE_HOURS * HOUR && now - latestSlot(now) >= RETRY_WINDOW;
}

const realGh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

export function alarm({ lastOk, errors = '', context = '', now = new Date(), gh = realGh, mention = process.env.ALARM_MENTION, log = console.log }) {
  const stale = isStale(lastOk, now);
  const open = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number', '--limit', '5']) || '[]');
  const ageText = lastOk ? `${((now - Date.parse(lastOk)) / HOUR).toFixed(1)}h (viimane edukas: ${lastOk})` : 'teadmata (andmeid pole)';
  if (stale && !open.length) {
    gh(['label', 'create', LABEL, '--color', 'D93F0B', '--description', 'Timetable is not updating', '--force']);
    const body = [
      `${mention ? `@${mention} ` : ''}Tunniplaan pole uuenenud ${ageText}.`,
      '',
      `Kontrollitud: ${tallinnIso(now)}${context ? ` (${context})` : ''}`,
      errors ? `\nViimased vead:\n\`\`\`\n${errors.slice(0, 3000)}\n\`\`\`` : '',
      '',
      'See issue suletakse automaatselt, kui tunniplaan jälle uueneb.',
    ].join('\n');
    const url = gh(['issue', 'create', '--title', TITLE, '--label', LABEL, '--body', body]).trim();
    log(`alarm OPENED: ${url}`);
    return { action: 'opened', stale };
  }
  if (!stale && open.length) {
    for (const { number } of open) {
      gh(['issue', 'close', String(number), '--comment', `Taastus: tunniplaan uuendati ${lastOk}${context ? ` (${context})` : ''}.`]);
      log(`alarm CLOSED: #${number}`);
    }
    return { action: 'closed', stale };
  }
  log(`alarm: ${stale ? `still stale, issue #${open[0].number} already open` : 'ok'} (age ${ageText})`);
  return { action: 'none', stale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : '');
  alarm({ lastOk: opt('--last-ok') || null, errors: opt('--errors'), context: opt('--context') });
}
