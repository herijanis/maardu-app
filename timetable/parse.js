// Pure: turns the raw EduPage download (see edupage.js) into data/timetable.json per shared/contract.md.
import { subjectKey } from '../shared/subject.js';
import { weekday } from './time.js';
import { isHoliday } from './holidays.js';
import { BASE, versionFor } from './edupage.js';

const byId = (rows = []) => Object.fromEntries(rows.map((r) => [r.id, r]));

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

// Substitution viewer HTML -> [{ periods: [n...] | null, text }] for one class.
// Sections look like <div class="section"><div class="header">11.erh</div><div class="rows">…rows…</div></div>
export function parseSubstitutions(html, className) {
  const out = [];
  for (const sec of String(html ?? '').split(/<div class="section[^"]*">/).slice(1)) {
    const header = sec.match(/<div class="header">([\s\S]*?)<\/div>/);
    if (!header) continue;
    if (!stripTags(header[1]).split(/[,\s]+/).includes(className)) continue;
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

export function parse(raw) {
  const { className, monday, dateTo, versions } = raw;
  const tables = Object.fromEntries(Object.entries(raw.tables).map(([num, t]) => [num, {
    subjects: byId(t.subjects), teachers: byId(t.teachers), classrooms: byId(t.classrooms),
  }]));

  const periods = (raw.tables[raw.defaultNum].periods ?? [])
    .filter((p) => p.starttime && p.endtime)
    .map((p) => ({ period: Number(p.period), start: p.starttime, end: p.endtime }))
    .sort((a, b) => a.period - b.period);
  const periodByNum = Object.fromEntries(periods.map((p) => [p.period, p]));

  const subst = Object.fromEntries(Object.entries(raw.substitutions ?? {}).map(([d, html]) => [d, parseSubstitutions(html, className)]));

  const lessons = [];
  for (const it of raw.items) {
    if (it.type !== 'card' || it.date < monday || it.date > dateTo || isHoliday(it.date)) continue;
    const t = tables[versionFor(versions, it.date).tt_num] ?? tables[raw.defaultNum];
    const subject = t.subjects[it.subjectid]?.name ?? t.subjects[it.subjectid]?.short ?? '?';
    const teacher = (it.teacherids ?? []).map((id) => t.teachers[id]?.short).filter(Boolean).join(', ') || null;
    const room = (it.classroomids ?? []).map((id) => t.classrooms[id]?.short || t.classrooms[id]?.name).filter(Boolean).join(', ') || null;
    const group = (it.groupnames ?? []).filter((g) => g && g !== 'Terve klass').join(', ') || null;
    const first = Number(it.uniperiod);
    const span = Number(it.durationperiods) || 1;
    for (let p = first; p < first + span; p++) {
      const times = periodByNum[p];
      const hits = (subst[it.date] ?? []).filter((s) => !s.periods || s.periods.includes(p));
      lessons.push({
        date: it.date, weekday: weekday(it.date), period: p,
        start: span === 1 ? it.starttime : times?.start ?? it.starttime,
        end: span === 1 ? it.endtime : times?.end ?? it.endtime,
        subject, subjectKey: subjectKey(subject), teacher, room, group,
        changed: hits.length > 0,
        note: hits.length ? hits.map((s) => s.text).join('; ') : null,
      });
    }
  }
  lessons.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period || String(a.group).localeCompare(String(b.group)));

  return { class: className, source: `${BASE}/timetable/`, fetchedAt: raw.fetchedAt, from: monday, to: dateTo, periods, lessons };
}
