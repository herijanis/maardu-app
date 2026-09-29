// Network side: downloads everything the parser needs from Maardu Gümnaasium's EduPage into one "raw" object.
// - ttviewer.js lists the timetable versions (the school publishes a new one per week)
// - regulartt.js gives a version's tables (classes, periods, subjects, teachers, classrooms)
// - currenttt.js gives dated lessons for a class and picks the right version per date by itself
// - the substitution viewer (HTML) lists asendused per day; the school rarely uses it
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { addDays, weekday, ymd, tallinnIso } from './time.js';

export const BASE = 'https://mgm.edupage.org';
export const WEEKS = 3; // current + next + the one after (EduPage extends the newest version open-ended)
const KEEP_TABLES = ['classes', 'periods', 'subjects', 'teachers', 'classrooms'];
const KEEP_FIELDS = ['id', 'name', 'short', 'period', 'starttime', 'endtime'];
const pick = (row) => Object.fromEntries(KEEP_FIELDS.filter((k) => k in row).map((k) => [k, row[k]]));

// Node gives each resolved address only 250 ms to connect by default; from far-away CI runners that
// made every address time out (ETIMEDOUT) within a second.
setDefaultAutoSelectFamilyAttemptTimeout(2500);

async function rpc(path, args) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'maardu-app timetable fetcher' },
    body: JSON.stringify({ __args: args, __gsh: '00000000' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.r === undefined) throw new Error(`${path.split('?')[0]}: unexpected response ${JSON.stringify(json).slice(0, 200)}`);
  return json.r;
}

// The version EduPage uses for a date: the latest visible one whose datefrom <= date.
export function versionFor(versions, date) {
  return versions.filter((v) => v.datefrom <= date).at(-1) ?? versions[0];
}

export async function fetchRaw({ className = '11.erh', now = new Date() } = {}) {
  const today = ymd(now);
  const monday = addDays(today, 1 - weekday(today));
  const dateTo = addDays(monday, WEEKS * 7 - 1);
  const schoolYear = Number(monday.slice(0, 4)) - (monday.slice(5, 7) < '08' ? 1 : 0);

  const viewer = await rpc('/timetable/server/ttviewer.js?__func=getTTViewerData', [null, schoolYear]);
  const versions = (viewer.regular?.timetables ?? [])
    .filter((v) => !v.hidden)
    .map(({ tt_num, datefrom, year, text }) => ({ tt_num, datefrom, year, text }))
    .sort((a, b) => a.datefrom.localeCompare(b.datefrom));
  if (!versions.length) throw new Error('no timetable versions published');
  const defaultNum = viewer.regular.default_num ?? versions.at(-1).tt_num;

  const tables = {};
  const loadVersion = async (num) => {
    if (tables[num]) return;
    const r = await rpc('/timetable/server/regulartt.js?__func=regularttGetData', [null, num]);
    tables[num] = Object.fromEntries(r.dbiAccessorRes.tables.filter((t) => KEEP_TABLES.includes(t.id)).map((t) => [t.id, (t.data_rows ?? []).map(pick)]));
  };
  await loadVersion(defaultNum);
  const cls = tables[defaultNum].classes.find((c) => c.name === className || c.short === className);
  if (!cls) throw new Error(`class ${className} not found in timetable`);

  const current = await rpc('/timetable/server/currenttt.js?__func=curentttGetData', [null, {
    year: versions.at(-1).year, datefrom: monday, dateto: dateTo, table: 'classes', id: cls.id,
    showColors: true, showIgroupsInClasses: false, showOrig: true, log_module: 'CurrentTTView',
  }]);
  const items = current.ttitems ?? [];
  for (const num of new Set(items.map((it) => versionFor(versions, it.date).tt_num))) await loadVersion(num);

  const dates = [...new Set(items.map((it) => it.date))].sort();
  const substitutions = Object.fromEntries(await Promise.all(dates.map(async (date) => {
    try {
      return [date, await rpc('/substitution/server/viewer.js?__func=getSubstViewerDayDataHtml', [null, { date, mode: 'classes' }])];
    } catch {
      return [date, null]; // substitutions are optional
    }
  })));

  return { className, classId: cls.id, fetchedAt: tallinnIso(now), monday, dateTo, versions, defaultNum, tables, items, substitutions };
}
