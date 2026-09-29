// CI step: picks what to deploy. Candidates are the fresh Actions fetch plus older copies (the Mac's
// `snapshots` branch, the Actions cache, the live site). Invalid ones are dropped and the NEWEST fetchedAt wins.
// Writes <out>/timetable.json + <out>/status.json and prints GitHub step outputs.
//
// node timetable/publish.js --out _site/data --keep last-good/timetable.json \
//   --candidate actions=data/timetable.json --candidate mac=candidates/mac.json \
//   --candidate cache=last-good/timetable.json --candidate cache=candidates/live.json [--fetch-status data/status.json]
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.js';
import { latestSlot, tallinnIso } from './time.js';

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

// candidates: [{ source, tt }] -> { chosen, rejected, status, fresh }
export function choose(candidates, { now = new Date(), fetchError = null, className = '11.erh' } = {}) {
  const rejected = [];
  const valid = [];
  for (const c of candidates) {
    if (!c.tt) continue;
    const errors = validate(c.tt, { className });
    if (errors.length) rejected.push({ source: c.source, errors });
    else valid.push(c);
  }
  valid.sort((a, b) => Date.parse(b.tt.fetchedAt) - Date.parse(a.tt.fetchedAt));
  const chosen = valid[0] ?? null;
  const slot = latestSlot(now);
  const fresh = !!chosen && Date.parse(chosen.tt.fetchedAt) >= slot.getTime();
  const status = {
    timetable: {
      ok: fresh,
      at: tallinnIso(now),
      ...(fetchError ? { error: fetchError } : {}),
      lastOk: chosen?.tt.fetchedAt ?? null,
      source: chosen?.source ?? null,
    },
  };
  return { chosen, rejected, status, fresh, slot };
}

const slotKey = (slot) => tallinnIso(slot).slice(0, 13); // 2026-09-29T07

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => args[args.indexOf(name) + 1];
  const candidates = args.flatMap((a, i) => (a === '--candidate' ? [args[i + 1]] : [])).map((spec) => {
    const [source, file] = spec.split('=');
    const tt = existsSync(file) ? readJson(file) : null;
    console.log(`candidate ${source} ${file}: ${tt ? tt.fetchedAt : 'none'}`);
    return { source, tt };
  });
  const fetchStatus = args.includes('--fetch-status') ? readJson(opt('--fetch-status'))?.timetable : null;
  const fetchError = fetchStatus && !fetchStatus.ok ? fetchStatus.error ?? 'fetch failed' : null;

  const { chosen, rejected, status, fresh, slot } = choose(candidates, { fetchError });
  for (const r of rejected) console.log(`::warning::rejected ${r.source}: ${r.errors.join('; ')}`);
  const outputs = {
    fresh, slot: slotKey(slot), lastOk: status.timetable.lastOk ?? '', source: status.timetable.source ?? '',
    error: fetchError ?? '',
  };
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${String(v).replace(/\n/g, ' ')}`).join('\n') + '\n');
  }
  if (!chosen) {
    console.log('::error::No valid timetable from any source; keeping the current deployment.');
    process.exit(1);
  }
  const out = opt('--out');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'timetable.json'), JSON.stringify(chosen.tt, null, 2) + '\n');
  writeFileSync(join(out, 'status.json'), JSON.stringify(status, null, 2) + '\n');
  if (args.includes('--keep')) {
    mkdirSync(dirname(opt('--keep')), { recursive: true });
    writeFileSync(opt('--keep'), JSON.stringify(chosen.tt, null, 2) + '\n');
  }
  console.log(`deploying ${chosen.source} data fetched ${chosen.tt.fetchedAt} (${chosen.tt.lessons.length} lessons), fresh for slot ${outputs.slot}: ${fresh}`);
  if (!fresh) console.log(`::warning::Deploying data older than the ${outputs.slot}:00 slot${fetchError ? `; fetch error: ${fetchError}` : ''}`);
}
