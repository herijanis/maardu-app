import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../parse.js';
import { isStale, alarm } from '../alarm.js';
import { checkSite } from '../watchdog.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}/raw.json`, import.meta.url), 'utf8'));
const tt0929 = parse(fixture('2026-09-29'));

test('alarm: 12h rule ignores the normal overnight gap', () => {
  const t = (s) => new Date(s);
  assert.equal(isStale('2026-09-29T19:01:00+03:00', t('2026-09-30T07:20:00+03:00')), false); // 07:00 retries running
  assert.equal(isStale('2026-09-29T19:01:00+03:00', t('2026-09-30T09:40:00+03:00')), true); // 07:00 slot fully missed
  assert.equal(isStale('2026-09-30T07:05:00+03:00', t('2026-09-30T19:30:00+03:00')), false); // 12:00 missed, 19:00 retrying
  assert.equal(isStale('2026-09-30T07:05:00+03:00', t('2026-09-30T21:40:00+03:00')), true);
  assert.equal(isStale(null), true);
});

test('alarm opens one issue, then closes it on recovery', () => {
  const calls = [];
  let open = [];
  const gh = (args) => {
    calls.push(args.slice(0, 2).join(' '));
    if (args[1] === 'list') return JSON.stringify(open);
    if (args[1] === 'create' && args[0] === 'issue') { open = [{ number: 7 }]; return 'https://github.com/x/y/issues/7\n'; }
    if (args[1] === 'close') open = [];
    return '';
  };
  const now = new Date('2026-09-30T21:40:00+03:00');
  const log = () => {};
  assert.equal(alarm({ lastOk: '2026-09-30T07:05:00+03:00', errors: 'ETIMEDOUT', now, gh, log }).action, 'opened');
  assert.equal(alarm({ lastOk: '2026-09-30T07:05:00+03:00', now, gh, log }).action, 'none'); // no duplicate
  assert.equal(alarm({ lastOk: '2026-09-30T21:30:00+03:00', now, gh, log }).action, 'closed');
  assert.deepEqual(calls.filter((c) => c !== 'issue list'), ['label create', 'issue create', 'issue close']);
});

test('watchdog reads the live site and flags broken data', async () => {
  const site = (tt, status = {}) => async (url) => ({ ok: true, json: async () => (url.includes('timetable') ? tt : status) });
  assert.deepEqual(await checkSite('s', { fetchImpl: site(tt0929) }), { lastOk: tt0929.fetchedAt, errors: [] });
  const broken = await checkSite('s', { fetchImpl: site({ ...tt0929, lessons: [] }, { timetable: { ok: false, error: 'ETIMEDOUT' } }) });
  assert.equal(broken.lastOk, null);
  assert.equal(broken.errors.length, 2);
  const down = await checkSite('s', { fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(down.lastOk, null);
});
