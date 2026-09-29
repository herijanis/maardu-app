// Never publish bad data: returns a list of problems (empty = OK).
import { addDays, weekday } from './time.js';
import { isHoliday, holidaysKnown } from './holidays.js';

export const MIN_LESSONS = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export function validate(tt, { className = '11.erh' } = {}) {
  const errors = [];
  if (!tt || typeof tt !== 'object') return ['not an object'];
  if (tt.class !== className) errors.push(`class is ${JSON.stringify(tt.class)}, expected ${className}`);
  if (!tt.fetchedAt || isNaN(Date.parse(tt.fetchedAt))) errors.push('fetchedAt missing or invalid');
  if (!Array.isArray(tt.periods) || !tt.periods.length) errors.push('periods missing');
  if (!Array.isArray(tt.lessons)) return [...errors, 'lessons missing'];

  const bad = tt.lessons.filter((l) => !(l && DATE.test(l.date) && Number.isInteger(l.period) && l.weekday >= 1 && l.weekday <= 7
    && TIME.test(l.start) && TIME.test(l.end) && typeof l.subject === 'string' && l.subject && typeof l.subjectKey === 'string'
    && typeof l.changed === 'boolean'));
  if (bad.length) errors.push(`${bad.length} lessons with an invalid shape, e.g. ${JSON.stringify(bad[0]).slice(0, 120)}`);

  // Weekdays in the covered range that should have lessons. `from`/`to` are written by parse.js;
  // older files without them fall back to the span of their lessons.
  const dates = tt.lessons.map((l) => l.date).filter((d) => DATE.test(d ?? '')).sort();
  const from = DATE.test(tt.from ?? '') ? tt.from : dates[0];
  const to = DATE.test(tt.to ?? '') ? tt.to : dates.at(-1);
  let schoolDays = 0;
  let unknown = false;
  const missing = [];
  if (from && to) {
    const have = new Set(dates);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!holidaysKnown(d)) unknown = true;
      if (weekday(d) > 5 || !holidaysKnown(d) || isHoliday(d)) continue;
      schoolDays++;
      if (!have.has(d)) missing.push(d);
    }
  }
  if (missing.length) errors.push(`no lessons on school day(s) ${missing.join(', ')}`);
  // A range that is mostly holidays legitimately has few lessons (none in summer).
  const need = unknown ? MIN_LESSONS : Math.min(MIN_LESSONS, schoolDays * 4);
  if (tt.lessons.length < need) errors.push(`only ${tt.lessons.length} lessons (need at least ${need})`);
  return errors;
}
