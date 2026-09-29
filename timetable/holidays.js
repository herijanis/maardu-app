// Days without school. EduPage keeps showing the weekly timetable through holidays, so lessons on these
// dates are dropped, and validation only expects lessons on weekdays that are not listed here.
// School breaks: mgm.ee/teenused ("Koolivaheajad 2026/2027"). Public holidays: Estonian riigipühad.
// Update every school year; after COVERED_UNTIL nothing is filtered and validation skips the weekday check.
export const COVERED_UNTIL = '2027-08-31';

const BREAKS = [
  ['2026-10-26', '2026-11-01'], // I vaheaeg
  ['2026-12-21', '2027-01-03'], // II vaheaeg
  ['2027-02-22', '2027-02-28'], // III vaheaeg
  ['2027-04-12', '2027-04-18'], // IV vaheaeg
  ['2027-06-09', '2027-08-31'], // V vaheaeg (summer)
];

const PUBLIC_HOLIDAYS = [
  '2026-12-24', '2026-12-25', '2026-12-26', // jõulud
  '2027-01-01', // uusaasta
  '2027-02-24', // iseseisvuspäev
  '2027-03-26', // suur reede
  '2027-03-28', // lihavõtted
  '2027-05-01', // kevadpüha
  '2027-05-16', // nelipühad
  '2027-06-23', '2027-06-24', // võidupüha, jaanipäev
  '2027-08-20', // taasiseseisvumispäev
];

const set = new Set(PUBLIC_HOLIDAYS);
export function isHoliday(date) {
  return set.has(date) || BREAKS.some(([a, b]) => date >= a && date <= b);
}
export const holidaysKnown = (date) => date <= COVERED_UNTIL;
