// Date helpers, all in Europe/Tallinn. Dates are 'YYYY-MM-DD' strings.
export const TZ = 'Europe/Tallinn';
export const SLOT_HOURS = [7, 12, 19]; // fetch slots, Tallinn time

export const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekday = (dateStr) => ((new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1=Mon

function parts(d) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(d).map((x) => [x.type, x.value]));
}

// 2026-09-29T07:00:03+03:00
export function tallinnIso(d = new Date()) {
  const p = parts(d);
  const off = p.timeZoneName.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

// The start of the latest fetch slot at or before `now`, as a Date.
export function latestSlot(now = new Date()) {
  const p = parts(now);
  const hour = Number(p.hour);
  let day = `${p.year}-${p.month}-${p.day}`;
  let slot = SLOT_HOURS.filter((h) => h <= hour).at(-1);
  if (slot === undefined) { day = addDays(day, -1); slot = SLOT_HOURS.at(-1); }
  return tallinnToDate(day, slot);
}

// Tallinn wall-clock day + hour -> Date (handles DST by probing both offsets).
export function tallinnToDate(day, hour) {
  for (const off of ['+03:00', '+02:00']) {
    const d = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00${off}`);
    if (Number(parts(d).hour) === hour && `${parts(d).year}-${parts(d).month}-${parts(d).day}` === day) return d;
  }
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+02:00`);
}
