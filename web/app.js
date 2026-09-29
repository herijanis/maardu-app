// 11.erh timetable UI. Plain ES module, no build step, no backend: works as a static site
// (GitHub Pages under /maardu-app/), so data is fetched by RELATIVE path.
// Data: data/timetable.json, data/status.json (see shared/contract.md).
// Testing aid: ?now=2026-09-30T10:30 pins the clock.

const $ = (id) => document.getElementById(id);

const WEEKDAYS = ['pühapäev', 'esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev'];
const WD_SHORT = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
const MONTHS = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];
const GROUP_KEY = 'maardu.group.v1';
const STALE_MS = 12 * 3600_000;

// Short labels for the compact week grid (phones). Unknown subjects fall back to abbreviate().
const ABBR = {
  'lai matemaatika': 'Mat L', 'kitsas matemaatika': 'Mat K', 'matemaatika': 'Mat',
  'eesti keel': 'Ee k', 'praktiline eesti keel': 'Pr ee', 'kirjandus': 'Kirj',
  'ettevalmistav kursus eesti keele eksamiks': 'Ee eks',
  'inglise keel': 'Ingl', 'praktiline inglise keel': 'Pr ingl', 'developing skills': 'Dev sk',
  'vene keel': 'Vene', 'saksa keel': 'Saksa', 'prantsuse keel': 'Pr k',
  'bioloogia': 'Bio', 'keemia': 'Keem', 'fuusika': 'Füüs', 'geograafia': 'Geo',
  'ajalugu': 'Aja', 'uhiskonnaopetus': 'Ühisk', 'muusika': 'Muus', 'kunst': 'Kunst',
  'kehaline kasvatus': 'Keh', 'liikumine': 'Liik', 'riigikaitse': 'Riigik',
  'karjaariopetus': 'Karj', 'autojuhtimine': 'Auto', 'uurimistoo alused': 'Uurim',
  'enesekaitse': 'Enesek', 'majandus': 'Maj', 'abipolitseinik': 'Abipol',
  'rahatarkus': 'Raha', 'esmaabi': 'Esma', 'informaatika': 'Info',
};

const state = {
  tt: null, status: null,
  view: 'day', date: null, weekStart: null,
  myGroup: loadGroup(),   // e.g. 'Grupp 1'; null = show both groups equally
  byDate: new Map(),      // date -> lessons sorted by period, group
  dates: [],              // school dates present in the timetable
  groups: [],             // distinct group names in the timetable
};

// ---------- time & dates ----------
const pinnedNow = new URLSearchParams(location.search).get('now');
function now() { return pinnedNow ? new Date(pinnedNow) : new Date(); }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
function monday(s) { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
function minutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function nowMinutes() { const n = now(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; }
function today() { return iso(now()); }
function tomorrow() { return addDays(today(), 1); }
function fmtDate(s) { const d = parse(s); return `${d.getDate()}. ${MONTHS[d.getMonth()]}`; }
function fmtShort(s) { const d = parse(s); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`; }
function weekday(s) { return WEEKDAYS[parse(s).getDay()]; }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function relLabel(s) {
  if (s === today()) return 'Täna';
  if (s === tomorrow()) return 'Homme';
  if (s === addDays(today(), -1)) return 'Eile';
  return '';
}
function stamp(isoTs) {
  if (!isoTs) return '';
  const d = new Date(isoTs);
  if (isNaN(d)) return '';
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return iso(d) === today() ? t : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${t}`;
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function hue(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return (h * 137) % 360; // spread neighbours apart
}
function abbreviate(l) {
  if (ABBR[l.subjectKey]) return ABBR[l.subjectKey];
  const words = l.subject.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 6);
  return words.slice(0, 2).map((w, i) => (i === 0 ? w.slice(0, 4) : w.slice(0, 3))).join(' ');
}
const otherGroup = (l) => !!(state.myGroup && l.group && l.group !== state.myGroup);

function loadGroup() {
  try { return localStorage.getItem(GROUP_KEY) || null; } catch { return null; }
}
function saveGroup() {
  try { state.myGroup ? localStorage.setItem(GROUP_KEY, state.myGroup) : localStorage.removeItem(GROUP_KEY); } catch {}
}

async function getJSON(path) {
  try {
    const r = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// ---------- data ----------
async function loadData() {
  // Relative on purpose: the site lives under /maardu-app/ on GitHub Pages and at / locally.
  const [tt, status] = await Promise.all([getJSON('data/timetable.json'), getJSON('data/status.json')]);
  if (tt) state.tt = tt;
  else if (!state.tt) state.tt = (await getJSON('data/sample/timetable.json')) || { lessons: [], periods: [] };
  state.status = status;
  index();
  return !!tt;
}

function index() {
  state.byDate = new Map();
  for (const l of state.tt.lessons || []) {
    if (!state.byDate.has(l.date)) state.byDate.set(l.date, []);
    state.byDate.get(l.date).push(l);
  }
  for (const list of state.byDate.values()) {
    list.sort((a, b) => a.period - b.period || String(a.group ?? '').localeCompare(String(b.group ?? ''), 'et'));
  }
  state.dates = [...state.byDate.keys()].sort();
  state.groups = [...new Set((state.tt.lessons || []).map((l) => l.group).filter(Boolean))].sort();
  if (state.myGroup && !state.groups.includes(state.myGroup)) state.myGroup = null;
}

function lastGood() {
  const ts = [state.tt?.fetchedAt, state.status?.timetable?.lastOk].map((t) => Date.parse(t)).filter((t) => !isNaN(t));
  return ts.length ? Math.max(...ts) : null;
}

function defaultDate() {
  const want = now().getHours() >= 15 ? tomorrow() : today();
  return state.dates.find((d) => d >= want) || state.dates[state.dates.length - 1] || want;
}

// ---------- header ----------
function renderHeader() {
  const t = stamp(state.tt.fetchedAt);
  $('updated').textContent = t ? `Uuendatud ${t}` : 'Andmed puuduvad';

  // A single failed fetch is not the user's problem while the shown data is fresh.
  // Only warn when the newest good data (fetchedAt or status.timetable.lastOk) is over 12h old.
  const last = lastGood();
  const stale = last != null && now() - last > STALE_MS;
  const pill = $('stalePill');
  pill.hidden = !stale;
  if (stale) pill.innerHTML = `Tunniplaan võib olla vananenud <span>· ${esc(stamp(new Date(last).toISOString()))}</span>`;

  const gb = $('groupBtn');
  gb.hidden = !state.groups.length;
  gb.textContent = state.myGroup ? `G${state.myGroup.replace(/\D+/g, '') || state.myGroup}` : 'G?';
  gb.classList.toggle('is-set', !!state.myGroup);
  gb.title = state.myGroup ? `Minu grupp: ${state.myGroup}` : 'Vali oma grupp';
}

// ---------- day view ----------
function renderDay() {
  const date = state.date;
  const rel = relLabel(date);
  $('dayName').innerHTML = `${esc(cap(weekday(date)))}${rel ? ` <span class="rel">${rel}</span>` : ''}`;
  $('dayDate').textContent = fmtDate(date);
  $('prevDay').disabled = !state.dates.some((d) => d < date);
  $('nextDay').disabled = !state.dates.some((d) => d > date);

  // week strip: tap a day, see its first–last period at a glance
  const mon = monday(date);
  let strip = '';
  for (let k = 0; k < 5; k++) {
    const d = addDays(mon, k);
    const ls = state.byDate.get(d) || [];
    const span = ls.length ? `${ls[0].period}–${ls[ls.length - 1].period}` : '';
    strip += `<button class="strip-day${d === date ? ' is-sel' : ''}${d === today() ? ' is-today' : ''}" data-date="${d}" ${ls.length ? '' : 'disabled'} aria-label="${weekday(d)} ${fmtDate(d)}">
      <span>${WD_SHORT[parse(d).getDay()]}</span><b>${parse(d).getDate()}</b><em>${span}</em></button>`;
  }
  $('dayStrip').innerHTML = strip;

  const lessons = state.byDate.get(date) || [];
  const ol = $('slots');
  if (!lessons.length) {
    ol.innerHTML = `<li class="empty"><b>Tunde pole</b>${state.dates.length ? 'Sellel päeval tunniplaanis tunde ei ole.' : 'Tunniplaani andmeid pole veel laaditud.'}</li>`;
    return;
  }

  const slots = new Map();
  for (const l of lessons) {
    if (!slots.has(l.period)) slots.set(l.period, []);
    slots.get(l.period).push(l);
  }
  const periods = [...slots.keys()].sort((a, b) => a - b);

  // current/next only make sense for today
  let nowP = null, nextP = null, progress = 0;
  if (date === today()) {
    const m = nowMinutes();
    for (const p of periods) {
      const l = slots.get(p)[0];
      const s = minutes(l.start), e = minutes(l.end);
      if (m >= s && m < e) { nowP = p; progress = (m - s) / (e - s); }
      else if (m < s && nextP == null) nextP = p;
    }
  }
  const past = (l) => date < today() || (date === today() && nowMinutes() >= minutes(l.end));

  let html = '';
  let prev = null;
  for (const p of periods) {
    if (prev != null && p - prev > 1) {
      const free = p - prev - 1;
      html += `<li class="gap-row"><span class="pnum">${free === 1 ? prev + 1 : `${prev + 1}–${p - 1}`}</span><span class="gap-line">${free === 1 ? 'vaba tund' : `${free} vaba tundi`}</span></li>`;
    }
    prev = p;
    const group = [...slots.get(p)].sort((x, y) => otherGroup(x) - otherGroup(y)); // own group first
    const first = group[0];
    const cls = p === nowP ? ' is-now' : past(first) ? ' is-past' : '';
    html += `<li class="slot${cls}">
      <div class="when"><span class="pnum">${p}</span><span class="time">${first.start}<br>${first.end}</span></div>
      <div class="cards">${group.map((l) => card(l, p === nowP, p === nextP, progress)).join('')}</div>
    </li>`;
  }
  ol.innerHTML = html;
}

function card(l, isNow, isNext, progress) {
  const cls = ['card', otherGroup(l) && 'other-group', l.changed && 'changed'].filter(Boolean).join(' ');
  const meta = [
    l.group && `<span class="chip">${esc(l.group)}</span>`,
    l.room && `<span>ruum ${esc(l.room)}</span>`,
    l.teacher && `<span>${esc(l.teacher)}</span>`,
  ].filter(Boolean).join('<span class="sep"></span>');
  const tags = [
    isNow && '<span class="tag tag-now">Praegu</span>',
    isNext && '<span class="tag tag-next">Järgmine</span>',
    l.changed && '<span class="tag tag-sub">Asendus</span>',
  ].filter(Boolean).join('');
  return `<div class="${cls}" style="--h:${hue(l.subjectKey)}">
    <div class="card-top"><span class="subj" title="${esc(l.subject)}">${esc(l.subject)}</span>${tags ? `<span class="card-tags">${tags}</span>` : ''}</div>
    ${meta ? `<div class="card-meta">${meta}</div>` : ''}
    ${l.note ? `<div class="card-meta">${esc(l.note)}</div>` : ''}
    ${isNow ? `<div class="progress"><i style="width:${Math.round(progress * 100)}%"></i></div>` : ''}
  </div>`;
}

// ---------- week view ----------
function renderWeek() {
  const mon = state.weekStart;
  const days = [0, 1, 2, 3, 4].map((k) => addDays(mon, k));
  const fri = days[4];
  const isThis = mon === monday(today());
  const isNext = mon === monday(addDays(today(), 7));
  $('weekName').textContent = isThis ? 'See nädal' : isNext ? 'Järgmine nädal' : 'Nädal';
  $('weekRange').textContent = `${fmtShort(mon)} – ${fmtShort(fri)}`;
  $('prevWeek').disabled = !state.dates.some((d) => d < mon);
  $('nextWeek').disabled = !state.dates.some((d) => d > fri);

  const lessons = days.flatMap((d) => state.byDate.get(d) || []);
  const grid = $('weekGrid');
  if (!lessons.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Tunde pole</b>Selle nädala tunniplaan puudub.</div>';
    return;
  }
  const ps = lessons.map((l) => l.period);
  const lo = Math.min(...ps), hi = Math.max(...ps);

  let nowKey = null;
  if (days.includes(today())) {
    const m = nowMinutes();
    const l = (state.byDate.get(today()) || []).find((x) => m >= minutes(x.start) && m < minutes(x.end));
    if (l) nowKey = `${l.date}|${l.period}`;
  }

  let html = '<div></div>';
  for (const d of days) {
    html += `<div class="wg-head${d === today() ? ' is-today' : ''}">${WD_SHORT[parse(d).getDay()]}<b>${parse(d).getDate()}</b></div>`;
  }
  for (let p = lo; p <= hi; p++) {
    html += `<div class="wg-p">${p}</div>`;
    for (const d of days) {
      const here = (state.byDate.get(d) || []).filter((l) => l.period === p).sort((x, y) => otherGroup(x) - otherGroup(y));
      const cls = ['wg-cell', !here.length && 'is-empty', d === today() && 'is-todaycol', nowKey === `${d}|${p}` && 'is-now'].filter(Boolean).join(' ');
      const split = here.length > 1;
      html += `<div class="${cls}">${here.map((l) => {
        const tip = `${l.subject}${l.group ? ` (${l.group})` : ''} · ${l.start}–${l.end}${l.room ? ` · ruum ${l.room}` : ''}${l.teacher ? ` · ${l.teacher}` : ''}`;
        const g = split && l.group ? `<span class="g">${esc(l.group.replace(/grupp\s*/i, 'G'))}</span>` : '';
        const c = ['wg-l', split && 'split', l.changed && 'changed', otherGroup(l) && 'other-group'].filter(Boolean).join(' ');
        return `<button class="${c}" style="--h:${hue(l.subjectKey)}" data-date="${d}" title="${esc(tip)}">
          <span class="ab">${esc(abbreviate(l))}</span><span class="full">${esc(l.subject)}</span>${g}${l.room ? `<span class="rm">${esc(l.room)}</span>` : ''}
        </button>`;
      }).join('')}</div>`;
    }
  }
  grid.innerHTML = html;
}

// ---------- rendering & navigation ----------
function render() {
  renderHeader();
  renderDay();
  renderWeek();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === view)));
  document.querySelector('.tab-ind').style.transform = `translateX(${view === 'week' ? 100 : 0}%)`;
  for (const v of ['day', 'week']) $(`view-${v}`).classList.toggle('is-active', v === view);
}

let animating = false;
function goDay(date, dir) {
  if (!date || date === state.date) return;
  const ol = $('slots');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || animating || !dir) {
    state.date = date; state.weekStart = monday(date); renderDay(); renderWeek();
    return;
  }
  animating = true;
  ol.classList.add(dir > 0 ? 'out-left' : 'out-right');
  setTimeout(() => {
    state.date = date; state.weekStart = monday(date);
    renderDay(); renderWeek();
    ol.classList.add('no-anim');
    ol.classList.remove('out-left', 'out-right');
    ol.classList.add(dir > 0 ? 'out-right' : 'out-left');
    void ol.offsetWidth;
    ol.classList.remove('no-anim', 'out-left', 'out-right');
    animating = false;
  }, 160);
}
function stepDay(dir) {
  const list = state.dates;
  const next = dir > 0 ? list.find((d) => d > state.date) : [...list].reverse().find((d) => d < state.date);
  goDay(next, dir);
}
function stepWeek(dir) {
  state.weekStart = addDays(state.weekStart, dir * 7);
  renderWeek();
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, 2600);
}

// Static site: "refresh" just refetches the JSON the scheduled deploy publishes.
async function refresh() {
  const btn = $('refreshBtn');
  if (btn.disabled) return;
  btn.disabled = true; btn.classList.add('spinning');
  const before = state.tt?.fetchedAt;
  const [ok] = await Promise.all([loadData(), new Promise((r) => setTimeout(r, 450))]);
  if (!state.dates.includes(state.date)) state.date = defaultDate();
  state.weekStart = monday(state.date);
  render();
  btn.disabled = false; btn.classList.remove('spinning');
  toast(!ok ? 'Pole ühendust' : state.tt.fetchedAt !== before ? 'Tunniplaan uuendatud' : 'Tunniplaan on ajakohane');
}

function bind() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  $('prevDay').addEventListener('click', () => stepDay(-1));
  $('nextDay').addEventListener('click', () => stepDay(1));
  $('prevWeek').addEventListener('click', () => stepWeek(-1));
  $('nextWeek').addEventListener('click', () => stepWeek(1));
  $('refreshBtn').addEventListener('click', refresh);
  $('groupBtn').addEventListener('click', () => {
    const order = [null, ...state.groups];
    state.myGroup = order[(order.indexOf(state.myGroup) + 1) % order.length];
    saveGroup();
    render();
    toast(state.myGroup ? `Minu grupp: ${state.myGroup}` : 'Näitan mõlemat gruppi');
  });

  $('dayStrip').addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (b) goDay(b.dataset.date, b.dataset.date > state.date ? 1 : -1);
  });
  $('weekGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (!b) return;
    goDay(b.dataset.date, 0);
    setView('day');
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    if (state.view === 'day') stepDay(dir); else stepWeek(dir);
  });

  // swipe between days
  const body = $('dayBody');
  let sx = null, sy = 0;
  body.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  body.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepDay(dx < 0 ? 1 : -1);
  });

  // keep now/next highlight fresh; refetch when the app comes back after a while (home-screen apps stay open for days)
  setInterval(() => { if (state.date === today()) renderDay(); }, 30_000);
  let hiddenAt = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (Date.now() - hiddenAt > 10 * 60_000) {
      await loadData();
      state.date = defaultDate(); state.weekStart = monday(state.date);
      render();
    }
  });
}

async function main() {
  bind();
  await loadData();
  state.date = defaultDate();
  state.weekStart = monday(state.date);
  setView('day');
  render();
}

main();
