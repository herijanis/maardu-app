// Mac backup publisher (layer 2 of team/reliability.md), run by launchd via timetable/mac-backup.sh.
// If the live site's data is older than the latest slot (07/12/19 Tallinn), fetch the timetable from this Mac
// (residential IP), and on success push data/timetable.json to the `snapshots` branch (never main) and start
// the Pages workflow on main, which deploys the newest source.
//
// node timetable/backup.js [--force] [--simulate-actions-down]
//   --force                  publish even if the live site is fresh (testing)
//   --simulate-actions-down  start the workflow with simulate_edupage_down, so it has to use this snapshot
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { latestSlot, tallinnIso } from './time.js';
import { validate } from './validate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE_URL || 'https://herijanis.github.io/maardu-app';
const BRANCH = 'snapshots';
const log = (...a) => console.log(tallinnIso(), ...a);
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();

async function liveFetchedAt() {
  try {
    const res = await fetch(`${SITE}/data/timetable.json?t=${Date.now()}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).fetchedAt ?? null;
  } catch (err) {
    log(`live site unreadable (${err.message}), treating as stale`);
    return null;
  }
}

// Commits data/timetable.json as the only file on `snapshots` without touching the working tree or index.
function pushSnapshot(file, fetchedAt) {
  const remote = git(['ls-remote', 'origin', `refs/heads/${BRANCH}`]).split(/\s/)[0] || null;
  if (remote) git(['fetch', '-q', 'origin', BRANCH]);
  const blob = git(['hash-object', '-w', file]);
  const dataTree = git(['mktree'], { input: `100644 blob ${blob}\ttimetable.json\n` });
  const root = git(['mktree'], { input: `040000 tree ${dataTree}\tdata\n` });
  const commit = git(['commit-tree', root, ...(remote ? ['-p', remote] : []), '-m', `Snapshot ${fetchedAt} (Mac backup)`]);
  git(['push', '-q', 'origin', `${commit}:refs/heads/${BRANCH}`]);
  return commit;
}

// GitHub disables scheduled workflows in public repos after 60 days without activity; turn them back on.
function reenableWorkflows() {
  try {
    const list = JSON.parse(execFileSync('gh', ['workflow', 'list', '--all', '--json', 'id,name,state'], { cwd: ROOT, encoding: 'utf8' }));
    for (const w of list.filter((w) => w.state === 'disabled_inactivity')) {
      execFileSync('gh', ['workflow', 'enable', String(w.id)], { cwd: ROOT, stdio: 'inherit' });
      log(`re-enabled workflow "${w.name}" (GitHub had disabled it for inactivity)`);
    }
  } catch (err) {
    log(`could not check workflow states: ${err.message}`);
  }
}

export async function runBackup({ force = false, simulateActionsDown = false } = {}) {
  reenableWorkflows();
  const slot = latestSlot();
  const live = await liveFetchedAt();
  if (!force && live && Date.parse(live) >= slot.getTime()) {
    log(`live site is fresh (${live} >= slot ${tallinnIso(slot)}), nothing to do`);
    return 'fresh';
  }
  log(`${force ? 'forced run' : `live site ${live ?? 'unknown'} is older than slot ${tallinnIso(slot)}`}, fetching from this Mac`);

  // fetch.js validates and only replaces data/timetable.json on success (it also keeps the Mac's local server fresh).
  const r = spawnSync(process.execPath, [join(ROOT, 'timetable', 'fetch.js')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TIMETABLE_SOURCE: 'mac' } });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  if (r.status !== 0) throw new Error(`fetch failed (exit ${r.status})`);
  const file = join(ROOT, 'data', 'timetable.json');
  const tt = JSON.parse(readFileSync(file, 'utf8'));
  const errors = validate(tt);
  if (errors.length) throw new Error(`fetched data invalid: ${errors.join('; ')}`);

  const commit = pushSnapshot(file, tt.fetchedAt);
  log(`pushed ${BRANCH} ${commit.slice(0, 7)} (${tt.lessons.length} lessons, fetched ${tt.fetchedAt})`);

  const args = ['workflow', 'run', 'pages.yml', '--ref', 'main', '-f', 'reason=mac backup'];
  if (simulateActionsDown) args.push('-f', 'simulate_edupage_down=true');
  execFileSync('gh', args, { cwd: ROOT, stdio: 'inherit' });
  log('started the Pages workflow');
  return 'published';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runBackup({ force: process.argv.includes('--force'), simulateActionsDown: process.argv.includes('--simulate-actions-down') });
  } catch (err) {
    log(`backup FAILED: ${err.message}`);
    process.exit(1);
  }
}
