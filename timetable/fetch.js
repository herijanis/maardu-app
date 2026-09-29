// Fetches the 11.erh timetable from Maardu Gümnaasium's EduPage (mgm.edupage.org) and writes
// data/timetable.json per shared/contract.md. Covers the current and the next week.
//
// Source notes:
// - The school publishes a new "regular" timetable version per week (e.g. "Tunniplaan 28.09 - 02.10.2026").
//   ttviewer.js lists the versions, regulartt.js gives one version's tables (subjects, teachers, rooms…),
//   currenttt.js gives dated lessons for a class and picks the right version per date by itself.
// - Substitutions (asendused) come from the public substitution viewer, which the school rarely uses.
//   When it lists something for our class, the matching lessons get changed=true and the text as note.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { subjectKey } from '../shared/subject.js';

const BASE = 'https://mgm.edupage.org';
const CLASS_NAME = process.env.TIMETABLE_CLASS || '11.erh';
const TZ = 'Europe/Tallinn';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

// Node gives each resolved address only 250 ms to connect by default; from far-away CI runners that
// made every address time out (ETIMEDOUT) within a second.
setDefaultAutoSelectFamilyAttemptTimeout(2500);

async function rpcOnce(path, args) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'maardu-app timetable fetcher' },
    body: JSON.stringify({ __args: args, __gsh: '00000000' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.r === undefined) throw new Error(`${path}: unexpected response ${JSON.stringify(json).slice(0, 200)}`);
  return json.r;
}
async function rpc(path, args, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await rpcOnce(path, args);
    } catch (err) {
      if (i >= tries) throw err;
      console.warn(`${path}: ${err.cause?.code ?? err.message}, retry ${i}/${tries - 1}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// --- dates (all in Europe/Tallinn) ---
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (dateStr) => ((new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1=Mon
export function tallinnIso(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const off = p.timeZoneName.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

// --- timetable versions ---
const tables = new Map(); // tt_num -> { byId: {table: {id: row}}, rows: {table: rows} }
async function loadVersion(ttNum) {
  if (!tables.has(ttNum)) {
    const r = await rpc('/timetable/server/regulartt.js?__func=regularttGetData', [null, ttNum]);
    const rows = Object.fromEntries(r.dbiAccessorRes.tables.map((t) => [t.id, t.data_rows ?? []]));
    const byId = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, Object.fromEntries(v.map((x) => [x.id, x]))]));
    tables.set(ttNum, { rows, byId });
  }
  return tables.get(ttNum);
}
// The version EduPage uses for a date: the latest visible one whose datefrom <= date.
function versionFor(versions, date) {
  return versions.filter((v) => v.datefrom <= date).at(-1) ?? versions[0];
}

// --- substitutions (best effort; HTML) ---
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
async function substitutions(date) {
  const html = await rpc('/substitution/server/viewer.js?__func=getSubstViewerDayDataHtml', [null, { date, mode: 'classes' }]);
  const out = []; // { periods: [n...] | null, text }
  // Sections look like <div class="section"><div class="header">11.erh</div><div class="rows">…rows…</div></div>
  for (const sec of String(html).split(/<div class="section[^"]*">/).slice(1)) {
    const header = sec.match(/<div class="header">([\s\S]*?)<\/div>/);
    if (!header) continue;
    const names = stripTags(header[1]).split(/[,\s]+/);
    if (!names.includes(CLASS_NAME)) continue;
    for (const row of sec.split(/<div class="row[^"]*">/).slice(1)) {
      const period = stripTags(row.match(/<div class="period">([\s\S]*?)<\/div>/)?.[1] ?? '');
      const text = stripTags(row.match(/<div class="info">([\s\S]*?)<\/div>/)?.[1] ?? '');
      if (!text) continue;
      const nums = period.match(/\d+/g)?.map(Number) ?? [];
      const periods = nums.length === 2 && /-/.test(period)
        ? Array.from({ length: nums[1] - nums[0] + 1 }, (_, i) => nums[0] + i) : nums;
      out.push({ periods: periods.length ? periods : null, text });
    }
  }
  return out;
}

export async function fetchTimetable(now = new Date()) {
  const today = ymd(now);
  const monday = addDays(today, 1 - weekday(today));
  const dateTo = addDays(monday, 13); // this week + next week

  const viewer = await rpc('/timetable/server/ttviewer.js?__func=getTTViewerData', [null, Number(monday.slice(0, 4)) - (monday.slice(5, 7) < '08' ? 1 : 0)]);
  const versions = (viewer.regular?.timetables ?? []).filter((v) => !v.hidden).sort((a, b) => a.datefrom.localeCompare(b.datefrom));
  if (!versions.length) throw new Error('no timetable versions published');
  const year = versions.at(-1).year;

  const current = await loadVersion(viewer.regular.default_num ?? versions.at(-1).tt_num);
  const cls = current.rows.classes.find((c) => c.name === CLASS_NAME || c.short === CLASS_NAME);
  if (!cls) throw new Error(`class ${CLASS_NAME} not found in timetable`);

  const r = await rpc('/timetable/server/currenttt.js?__func=curentttGetData', [null, {
    year, datefrom: monday, dateto: dateTo, table: 'classes', id: cls.id,
    showColors: true, showIgroupsInClasses: false, showOrig: true, log_module: 'CurrentTTView',
  }]);
  const items = (r.ttitems ?? []).filter((it) => it.type === 'card' && it.date >= monday && it.date <= dateTo);

  const periods = current.rows.periods
    .filter((p) => p.starttime && p.endtime)
    .map((p) => ({ period: Number(p.period), start: p.starttime, end: p.endtime }))
    .sort((a, b) => a.period - b.period);
  const periodByNum = Object.fromEntries(periods.map((p) => [p.period, p]));

  const dates = [...new Set(items.map((it) => it.date))].sort();
  const subst = Object.fromEntries(await Promise.all(dates.map(async (d) => {
    try { return [d, await substitutions(d)]; } catch { return [d, []]; } // substitutions are optional
  })));

  const lessons = [];
  for (const it of items) {
    const v = versionFor(versions, it.date);
    const t = (await loadVersion(v.tt_num)).byId;
    const subject = t.subjects[it.subjectid]?.name ?? t.subjects[it.subjectid]?.short ?? '?';
    const teacher = (it.teacherids ?? []).map((id) => t.teachers[id]?.short).filter(Boolean).join(', ') || null;
    const room = (it.classroomids ?? []).map((id) => t.classrooms[id]?.short || t.classrooms[id]?.name).filter(Boolean).join(', ') || null;
    const group = (it.groupnames ?? []).filter((g) => g && g !== 'Terve klass').join(', ') || null;
    const first = Number(it.uniperiod);
    const span = Number(it.durationperiods) || 1;
    for (let p = first; p < first + span; p++) {
      const times = periodByNum[p];
      const start = span === 1 ? it.starttime : times?.start ?? it.starttime;
      const end = span === 1 ? it.endtime : times?.end ?? it.endtime;
      const hits = (subst[it.date] ?? []).filter((s) => !s.periods || s.periods.includes(p));
      lessons.push({
        date: it.date, weekday: weekday(it.date), period: p, start, end,
        subject, subjectKey: subjectKey(subject), teacher, room, group,
        changed: hits.length > 0,
        note: hits.length ? hits.map((s) => s.text).join('; ') : null,
      });
    }
  }
  lessons.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period || String(a.group).localeCompare(String(b.group)));

  return {
    class: CLASS_NAME,
    source: `${BASE}/timetable/`,
    fetchedAt: tallinnIso(now),
    periods,
    lessons,
  };
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
  status.timetable = entry;
  await writeJson(file, status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const tt = await fetchTimetable();
    if (!tt.lessons.length) throw new Error('timetable came back empty');
    await writeJson(join(DATA, 'timetable.json'), tt);
    await setStatus({ ok: true, at: tallinnIso() });
    console.log(`timetable: ${tt.lessons.length} lessons ${tt.lessons[0].date}..${tt.lessons.at(-1).date}`);
  } catch (err) {
    await setStatus({ ok: false, at: tallinnIso(), error: String(err?.message ?? err) });
    console.error('timetable fetch failed:', err);
    process.exit(1);
  }
}
