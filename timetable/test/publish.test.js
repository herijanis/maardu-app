import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../parse.js';
import { choose } from '../publish.js';
import { latestSlot, tallinnIso } from '../time.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}/raw.json`, import.meta.url), 'utf8'));
const tt0929 = parse(fixture('2026-09-29'));

test('publish picks the newest valid source and reports freshness', () => {
  const at = (iso) => ({ ...tt0929, fetchedAt: iso });
  const now = new Date('2026-09-30T12:30:00+03:00');
  // Actions fetch failed; Mac snapshot is newest and fresh for the 12:00 slot.
  let r = choose([
    { source: 'mac', tt: at('2026-09-30T12:10:00+03:00') },
    { source: 'cache', tt: at('2026-09-30T07:01:00+03:00') },
    { source: 'cache', tt: at('2026-09-29T19:00:00+03:00') },
  ], { now, fetchError: 'ETIMEDOUT' });
  assert.equal(r.chosen.source, 'mac');
  assert.deepEqual(r.status.timetable, { ok: true, at: '2026-09-30T12:30:00+03:00', error: 'ETIMEDOUT', lastOk: '2026-09-30T12:10:00+03:00', source: 'mac' });
  // Only old data: deploy it, but ok:false.
  r = choose([{ source: 'cache', tt: at('2026-09-30T07:01:00+03:00') }], { now, fetchError: 'ETIMEDOUT' });
  assert.equal(r.fresh, false);
  assert.equal(r.status.timetable.lastOk, '2026-09-30T07:01:00+03:00');
  // An invalid newer candidate is rejected, not published.
  r = choose([{ source: 'actions', tt: { ...at('2026-09-30T12:31:00+03:00'), lessons: [] } }, { source: 'cache', tt: at('2026-09-30T07:01:00+03:00') }], { now });
  assert.equal(r.chosen.source, 'cache');
  assert.equal(r.rejected[0].source, 'actions');
  assert.equal(choose([], { now }).chosen, null);
});

test('slots follow Tallinn time across DST', () => {
  assert.equal(tallinnIso(latestSlot(new Date('2026-09-29T02:00:00Z'))), '2026-09-28T19:00:00+03:00');
  assert.equal(tallinnIso(latestSlot(new Date('2026-09-29T09:30:00Z'))), '2026-09-29T12:00:00+03:00');
  assert.equal(tallinnIso(latestSlot(new Date('2026-12-01T05:30:00Z'))), '2026-12-01T07:00:00+02:00');
  assert.equal(tallinnIso(latestSlot(new Date('2026-10-25T06:00:00Z'))), '2026-10-25T07:00:00+02:00'); // DST ends that night
});
