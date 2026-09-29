import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../parse.js';
import { parseSubstitutions } from '../parse.js';
import { validate } from '../validate.js';
import { withRetry } from '../fetch.js';
import { isHoliday } from '../holidays.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}/raw.json`, import.meta.url), 'utf8'));
const tt0929 = parse(fixture('2026-09-29'));

test('parses the real 11.erh week: Wed 2026-09-30', () => {
  const day = tt0929.lessons.filter((l) => l.date === '2026-09-30');
  assert.deepEqual(day[0], {
    date: '2026-09-30', weekday: 3, period: 1, start: '08:15', end: '09:00', subject: 'Enesekaitse',
    subjectKey: 'enesekaitse', teacher: 'Jakovlev', room: '300', group: null, changed: false, note: null,
  });
  assert.deepEqual(day.map((l) => [l.period, l.subject, l.group]), [
    [1, 'Enesekaitse', null], [2, 'Geograafia', null], [3, 'Praktiline eesti keel', null],
    [4, 'Lai matemaatika', null], [5, 'Developing skills', null], [6, 'Majandus', null],
    [7, 'Inglise keel', 'Grupp 1'], [7, 'Eesti keel', 'Grupp 2'],
    [8, 'Eesti keel', 'Grupp 1'], [8, 'Inglise keel', 'Grupp 2'], [9, 'Abipolitseinik', null],
  ]);
});

test('covers three weeks (Mon..Sun) with periods and a valid shape', () => {
  assert.equal(tt0929.class, '11.erh');
  assert.equal(tt0929.from, '2026-09-28');
  assert.equal(tt0929.to, '2026-10-18');
  assert.equal(new Set(tt0929.lessons.map((l) => l.date)).size, 15);
  assert.deepEqual(tt0929.periods[0], { period: 1, start: '08:15', end: '09:00' });
  assert.deepEqual(validate(tt0929), []);
});

test('drops lessons on school holidays (EduPage keeps showing them)', () => {
  const tt = parse(fixture('2026-10-20'));
  const dates = new Set(tt.lessons.map((l) => l.date));
  assert.ok(dates.has('2026-10-23'));
  for (const d of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) assert.ok(!dates.has(d), d);
  assert.ok(dates.has('2026-11-02'));
  assert.deepEqual(validate(tt), []);
  assert.ok(isHoliday('2026-12-24') && isHoliday('2027-07-01') && !isHoliday('2026-09-30'));
});

test('expands multi-period lessons and applies substitutions', () => {
  const raw = fixture('2026-09-29');
  const item = { ...raw.items.find((i) => i.date === '2026-09-30' && i.uniperiod === '1'), durationperiods: 2 };
  const html = '<div class="section print-nobreak"><div class="header">11.erh</div><div class="rows">'
    + '<div class="row change"><div class="period"><span>1 - 2</span></div><div class="info"><span>Enesekaitse: Jakovlev ➔ Tamm</span></div></div>'
    + '</div></div><div class="section"><div class="header">11.md</div><div class="rows">'
    + '<div class="row"><div class="period"><span>3</span></div><div class="info"><span>Tühistatud</span></div></div></div></div>';
  const tt = parse({ ...raw, items: [item], substitutions: { '2026-09-30': html } });
  assert.deepEqual(tt.lessons.map((l) => [l.period, l.start, l.end, l.changed, l.note]), [
    [1, '08:15', '09:00', true, 'Enesekaitse: Jakovlev ➔ Tamm'],
    [2, '09:10', '09:55', true, 'Enesekaitse: Jakovlev ➔ Tamm'],
  ]);
  assert.deepEqual(parseSubstitutions(html, '11.md'), [{ periods: [3], text: 'Tühistatud' }]);
  const none = raw.substitutions['2026-09-29'];
  assert.match(none, /pole tühistatud tunde või asendusi/);
  assert.deepEqual(parseSubstitutions(none, '11.erh'), []);
});

test('validation rejects bad data', () => {
  const base = structuredClone(tt0929);
  assert.match(validate({ ...base, class: '11.md' }).join(), /class is "11.md"/);
  assert.match(validate({ ...base, lessons: base.lessons.slice(0, 10) }).join(), /only 10 lessons \(need at least 20\)/);
  assert.match(validate({ ...base, lessons: base.lessons.filter((l) => l.date !== '2026-10-07') }).join(), /no lessons on school day\(s\) 2026-10-07/);
  assert.match(validate({ ...base, lessons: [...base.lessons, { date: 'x' }] }).join(), /invalid shape/);
  assert.match(validate({ ...base, fetchedAt: 'nope' }).join(), /fetchedAt/);
  assert.deepEqual(validate(null), ['not an object']);
  // A range that is all holidays (summer) is valid with no lessons.
  assert.deepEqual(validate({ ...base, from: '2027-07-05', to: '2027-07-25', lessons: [] }), []);
});

test('retries with backoff until the budget runs out, but not on invalid data', async () => {
  let n = 0;
  const waits = [];
  const sleep = async (ms) => waits.push(ms);
  const flaky = async () => { if (++n < 3) throw new TypeError('fetch failed', { cause: { code: 'ETIMEDOUT' } }); return 'ok'; };
  assert.equal(await withRetry(flaky, { budgetMs: 60_000, sleep, log: () => {} }), 'ok');
  assert.deepEqual(waits, [5000, 10000]);
  await assert.rejects(withRetry(async () => { throw new Error('down'); }, { budgetMs: 0, sleep, log: () => {} }), /down/);
  n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new Error('invalid timetable: x'); }, { budgetMs: 60_000, sleep, log: () => {} }), /invalid/);
  assert.equal(n, 1);
});
