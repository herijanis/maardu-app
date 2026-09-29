// 11.erh timetable + homework UI. Plain ES module, no build step.
// Data: /data/timetable.json, /data/homework.json, /data/status.json (see shared/contract.md).
// Testing aid: ?now=2026-09-30T10:30 pins the clock.

const $ = (id) => document.getElementById(id);

const WEEKDAYS = ['pühapäev', 'esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev'];
const WD_SHORT = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
const MONTHS = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];
const TYPE_LABEL = { homework: 'Kodutöö', test: 'Kontrolltöö', task: 'Ülesanne', other: 'Muu' };
const DONE_KEY = 'maardu.done.v1';

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
  tt: null, hw: null, status: null,
  view: 'day', date: null, weekStart: null,
  done: loadDone(),
  byDate: new Map(),      // date -> lessons sorted by period, group
  work: new Map(),        // lessonId -> homework items
  unmatched: new Map(),   // date -> homework items with no lesson
  dates: [],              // school dates present in the timetable
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
function hhmm(isoTs) {
  if (!isoTs) return '';
  const d = new Date(isoTs);
  return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
const lessonId = (l) => `${l.date}|${l.period}|${l.group ?? ''}|${l.subjectKey}`;
const cleanType = (t) => (TYPE_LABEL[t] ? t : 'other');

function loadDone() {
  try { return JSON.parse(localStorage.getItem(DONE_KEY)) || {}; } catch { return {}; }
}
function saveDone() {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(state.done)); } catch {}
}
function isDone(item) { return item.id in state.done ? state.done[item.id] : item.done === true; }

async function getJSON(paths) {
  for (const p of paths) {
    try {
      const r = await fetch(p, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}
  }
  return null;
}

// ---------- data ----------
async function loadData() {
  // Served by server.js at /data/*; the relative fallbacks cover `npx serve .` from the repo root.
  const [tt, hw, status] = await Promise.all([
    getJSON(['/data/timetable.json', '../data/timetable.json', '../data/sample/timetable.json']),
    getJSON(['/data/homework.json', '../data/homework.json', '../data/sample/homework.json']),
    getJSON(['/data/status.json', '../data/status.json']),
  ]);
  state.tt = tt || { lessons: [], periods: [] };
  state.hw = hw || { items: [] };
  state.status = status;
  index();
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

  // Homework -> lesson: same date; by period (preferring a matching subjectKey when a period is split),
  // else the first lesson that day with the same subjectKey, else a looser subject match.
  state.work = new Map();
  state.unmatched = new Map();
  for (const item of state.hw.items || []) {
    const lessons = state.byDate.get(item.date) || [];
    let hit = null;
    if (item.period != null) {
      const same = lessons.filter((l) => l.period === Number(item.period));
      hit = same.find((l) => l.subjectKey === item.subjectKey) || same[0] || null;
    }
    if (!hit) hit = lessons.find((l) => l.subjectKey === item.subjectKey) || null;
    if (!hit && item.subjectKey) {
      const k = ` ${item.subjectKey} `;
      hit = lessons.find((l) => ` ${l.subjectKey} `.includes(k) || k.includes(` ${l.subjectKey} `)) || null;
    }
    if (hit) {
      const id = lessonId(hit);
      if (!state.work.has(id)) state.work.set(id, []);
      state.work.get(id).push(item);
    } else {
      if (!state.unmatched.has(item.date)) state.unmatched.set(item.date, []);
      state.unmatched.get(item.date).push(item);
    }
  }
}

function defaultDate() {
  const n = now();
  const want = n.getHours() >= 15 ? tomorrow() : today();
  return state.dates.find((d) => d >= want) || state.dates[state.dates.length - 1] || want;
}

// The "tomorrow" panel shows the next school day (or the day after today when nothing is scheduled).
function dueDate() {
  const t = tomorrow();
  const hwDates = (state.hw.items || []).map((i) => i.date);
  const next = [...new Set([...state.dates, ...hwDates])].filter((d) => d >= t).sort()[0];
  return next || t;
}

function workFor(l) { return state.work.get(lessonId(l)) || []; }
function workBadge(items) {
  if (!items.length) return '';
  const open = items.filter((i) => !isDone(i));
  const allDone = open.length === 0;
  if (items.some((i) => i.type === 'test')) return `<span class="tag tag-test">${allDone ? '✓ ' : ''}Kontrolltöö</span>`;
  const label = allDone ? '✓ Tehtud' : items.length > 1 ? `${items.length} tööd` : TYPE_LABEL[cleanType(items[0].type)];
  return `<span class="tag tag-work${allDone ? ' done-mark' : ''}">${label}</span>`;
}

// ---------- header ----------
function renderHeader() {
  const t = hhmm(state.tt.fetchedAt);
  const h = hhmm(state.hw.fetchedAt);
  $('updated').textContent = t ? `Uuendatud ${t}` : 'Andmed puuduvad';
  $('updated').title = [t && `Tunniplaan ${t}`, h && `eKool ${h}`].filter(Boolean).join(' · ');

  const fails = [];
  const s = state.status || {};
  if (s.timetable && s.timetable.ok === false) fails.push(['Tunniplaan', s.timetable]);
  if (s.ekool && s.ekool.ok === false) fails.push(['eKool', s.ekool]);
  const pill = $('errPill');
  pill.hidden = !fails.length;
  if (fails.length) {
    pill.textContent = fails.length === 2 ? 'Uuendus ebaõnnestus' : `${fails[0][0]}: viga`;
    pill.title = fails.map(([n, f]) => `${n}: ${f.error || 'viga'} (${hhmm(f.at)})`).join('\n');
  }

  const due = dueDate();
  const n = (state.work.size || state.unmatched.size)
    ? (state.hw.items || []).filter((i) => i.date === due && !isDone(i)).length : 0;
  $('tomorrowCount').hidden = !n;
  $('tomorrowCount').textContent = n;
}

// ---------- day view ----------
function renderDay() {
  const date = state.date;
  const rel = relLabel(date);
  $('dayName').innerHTML = `${esc(cap(weekday(date)))}${rel ? ` <span class="rel">${rel}</span>` : ''}`;
  $('dayDate').textContent = fmtDate(date);
  $('prevDay').disabled = !state.dates.some((d) => d < date);
  $('nextDay').disabled = !state.dates.some((d) => d > date);

  // week strip
  const mon = monday(date);
  let strip = '';
  for (let k = 0; k < 5; k++) {
    const d = addDays(mon, k);
    const has = state.byDate.has(d);
    const items = has ? state.byDate.get(d).flatMap(workFor).concat(state.unmatched.get(d) || []) : [];
    const dots = items.filter((x) => !isDone(x)).slice(0, 3)
      .map((x) => `<i class="${x.type === 'test' ? 'test' : ''}"></i>`).join('');
    strip += `<button class="strip-day${d === date ? ' is-sel' : ''}${d === today() ? ' is-today' : ''}" data-date="${d}" ${has ? '' : 'disabled'} aria-label="${weekday(d)} ${fmtDate(d)}">
      <span>${WD_SHORT[parse(d).getDay()]}</span><b>${parse(d).getDate()}</b><span class="dots">${dots}</span></button>`;
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
    const group = slots.get(p);
    const first = group[0];
    const cls = p === nowP ? ' is-now' : past(first) ? ' is-past' : '';
    html += `<li class="slot${cls}">
      <div class="when"><span class="pnum">${p}</span><span class="time">${first.start}<br>${first.end}</span></div>
      <div class="cards">${group.map((l) => card(l, p === nowP, p === nextP, progress)).join('')}</div>
    </li>`;
  }
  const other = state.unmatched.get(date) || [];
  if (other.length) {
    html += `<li class="slot slot-other"><div class="when"><span class="pnum">·</span><span class="time">Muu</span></div>
      <div class="cards">${other.map((i) => `<button class="card has-work${i.type === 'test' ? ' has-test' : ''}" style="--h:${hue(i.subjectKey)}" data-item="${esc(i.id)}">
        <div class="card-top"><span class="subj" title="${esc(i.subject)}">${esc(i.subject)}</span>${workBadge([i])}</div>
        <div class="card-meta"><span>${esc(i.title)}</span></div></button>`).join('')}</div></li>`;
  }
  ol.innerHTML = html;
}

function card(l, isNow, isNext, progress) {
  const items = workFor(l);
  const hasTest = items.some((i) => i.type === 'test');
  const cls = ['card', items.length && 'has-work', hasTest && 'has-test', l.changed && 'changed'].filter(Boolean).join(' ');
  const meta = [
    l.group && `<span class="chip">${esc(l.group)}</span>`,
    l.room && `<span>ruum ${esc(l.room)}</span>`,
    l.teacher && `<span>${esc(l.teacher)}</span>`,
  ].filter(Boolean).join('<span class="sep"></span>');
  const tags = [
    isNow && '<span class="tag tag-now">Praegu</span>',
    isNext && '<span class="tag tag-next">Järgmine</span>',
    l.changed && '<span class="tag tag-sub">Asendus</span>',
    workBadge(items),
  ].filter(Boolean).join('');
  const tag = items.length ? 'button' : 'div';
  const attrs = items.length ? ` data-lesson="${esc(lessonId(l))}" aria-label="${esc(l.subject)}: ${items.length} ülesannet"` : '';
  return `<${tag} class="${cls}" style="--h:${hue(l.subjectKey)}"${attrs}>
    <div class="card-top"><span class="subj" title="${esc(l.subject)}">${esc(l.subject)}</span>${tags ? `<span class="card-tags">${tags}</span>` : ''}</div>
    ${meta ? `<div class="card-meta">${meta}</div>` : ''}
    ${l.note ? `<div class="card-meta">${esc(l.note)}</div>` : ''}
    ${isNow ? `<div class="progress"><i style="width:${Math.round(progress * 100)}%"></i></div>` : ''}
  </${tag}>`;
}

// ---------- week view ----------
function renderWeek() {
  const mon = state.weekStart;
  const days = [0, 1, 2, 3, 4].map((k) => addDays(mon, k));
  const fri = days[4];
  const isThis = mon === monday(today());
  const isNext = mon === monday(addDays(today(), 7));
  $('weekName').innerHTML = isThis ? 'See nädal' : isNext ? 'Järgmine nädal' : 'Nädal';
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
      const here = (state.byDate.get(d) || []).filter((l) => l.period === p);
      const cls = ['wg-cell', !here.length && 'is-empty', d === today() && 'is-todaycol', nowKey === `${d}|${p}` && 'is-now'].filter(Boolean).join(' ');
      const split = here.length > 1;
      html += `<div class="${cls}">${here.map((l) => {
        const items = workFor(l).filter((i) => !isDone(i));
        const dot = items.length ? `<span class="dot${items.some((i) => i.type === 'test') ? ' test' : ''}"></span>` : '';
        const tip = `${l.subject}${l.group ? ` (${l.group})` : ''} · ${l.start}–${l.end}${l.room ? ` · ruum ${l.room}` : ''}${l.teacher ? ` · ${l.teacher}` : ''}`;
        const g = split && l.group ? `<span class="g">${esc(l.group.replace(/grupp\s*/i, 'G'))}</span>` : '';
        return `<button class="wg-l${split ? ' split' : ''}${l.changed ? ' changed' : ''}" style="--h:${hue(l.subjectKey)}" data-date="${d}" title="${esc(tip)}">
          ${dot}<span class="ab">${esc(abbreviate(l))}</span><span class="full">${esc(l.subject)}</span>${g}${l.room ? `<span class="rm">${esc(l.room)}</span>` : ''}
        </button>`;
      }).join('')}</div>`;
    }
  }
  grid.innerHTML = html;
}

// ---------- tomorrow checklist ----------
function renderTomorrow() {
  const due = dueDate();
  const t = tomorrow();
  $('tomorrowTitle').textContent = due === t ? 'Homseks' : `${cap(weekday(due))}ks`;
  $('tomorrowDate').textContent = `${weekday(due)} ${fmtShort(due)}`;

  const groups = [];
  for (const l of state.byDate.get(due) || []) {
    const items = workFor(l);
    if (items.length) groups.push({ lesson: l, items });
  }
  const other = state.unmatched.get(due) || [];
  if (other.length) groups.push({ lesson: null, items: other });

  const list = $('tomorrowList');
  if (!groups.length) {
    list.innerHTML = `<div class="empty"><b>Kõik korras</b>${due === t ? 'Homseks' : 'Selleks päevaks'} pole ühtegi kodutööd.</div>`;
    return;
  }
  list.innerHTML = groups.map(({ lesson: l, items }) => `
    <div class="cl-group">
      <h3 style="--h:${l ? hue(l.subjectKey) : 220}">${l
        ? `<span class="pn">${l.period}. tund</span><span class="nm" title="${esc(l.subject)}">${esc(l.subject)}${l.group ? ` · ${esc(l.group)}` : ''}</span>`
        : '<span class="nm" style="color:var(--muted)">Muu</span>'}</h3>
      <div class="cl-items">${items.map((i) => checkItem(i, l)).join('')}</div>
    </div>`).join('');
}

function checkItem(i, l) {
  const done = isDone(i);
  const test = i.type === 'test';
  return `<div class="cl-item${done ? ' is-done' : ''}">
    <button class="check" role="checkbox" aria-checked="${done}" data-done="${esc(i.id)}" aria-label="Märgi tehtuks"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#0f1115" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="cl-text" data-item="${esc(i.id)}">
      <div class="cl-title">${esc(i.title || i.subject)}</div>
      <div class="cl-sub">${test ? '<span class="tag tag-test">Kontrolltöö</span>' : ''}${!l ? `<span class="chip" style="--h:${hue(i.subjectKey)}">${esc(i.subject)}</span>` : ''}</div>
    </button>
  </div>`;
}

// ---------- bottom sheet ----------
let lastFocus = null;
function openSheet(lesson, items) {
  const first = lesson || { subject: items[0].subject, subjectKey: items[0].subjectKey, date: items[0].date };
  const meta = [
    `<span>${esc(weekday(first.date))} ${fmtShort(first.date)}</span>`,
    lesson && `<span>${lesson.period}. tund · ${lesson.start}–${lesson.end}</span>`,
    lesson?.room && `<span>ruum ${esc(lesson.room)}</span>`,
    lesson?.teacher && `<span>${esc(lesson.teacher)}</span>`,
    lesson?.group && `<span class="chip" style="--h:${hue(lesson.subjectKey)}">${esc(lesson.group)}</span>`,
  ].filter(Boolean).join('<span class="sep" style="width:3px;height:3px;border-radius:50%;background:var(--faint)"></span>');
  $('sheetBody').innerHTML = `
    <h2 id="sheetTitle">${esc(first.subject)}</h2>
    <div class="sh-meta">${meta}</div>
    ${items.map((i) => {
      const done = isDone(i);
      return `<div class="sh-item">
        <div class="sh-item-head">
          <span class="tag ${i.type === 'test' ? 'tag-test' : 'tag-work'}">${TYPE_LABEL[cleanType(i.type)]}</span>
          <label class="sh-done"><button class="check" role="checkbox" aria-checked="${done}" data-done="${esc(i.id)}" aria-label="Tehtud"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#0f1115" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>Tehtud</label>
        </div>
        <p class="sh-title">${esc(i.title)}</p>
        ${i.description ? `<p class="sh-desc">${esc(i.description)}</p>` : ''}
        ${i.url ? `<a class="sh-link" href="${esc(i.url)}" target="_blank" rel="noopener">Ava eKoolis ↗</a>` : ''}
      </div>`;
    }).join('')}`;
  const sheet = $('sheet'), bd = $('backdrop');
  lastFocus = document.activeElement;
  sheet.hidden = false; bd.hidden = false;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('open'); bd.classList.add('open'); }));
  sheet.focus?.();
}
function closeSheet() {
  const sheet = $('sheet'), bd = $('backdrop');
  if (sheet.hidden) return;
  sheet.style.transform = '';
  sheet.classList.remove('open'); bd.classList.remove('open');
  const done = () => { if (!sheet.classList.contains('open')) { sheet.hidden = true; bd.hidden = true; } };
  sheet.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 350);
  lastFocus?.focus?.();
}

// drag the sheet down to close
(() => {
  const sheet = $('sheet');
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0 && !e.target.closest('.sheet-handle')) return;
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 4) { sheet.classList.add('dragging'); sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.classList.remove('dragging');
    if (dy > 90) closeSheet(); else sheet.style.transform = '';
    y0 = null;
  });
})();

// ---------- rendering & navigation ----------
function render() {
  renderHeader();
  renderDay();
  renderWeek();
  renderTomorrow();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === view)));
  const idx = ['day', 'week', 'tomorrow'].indexOf(view);
  document.querySelector('.tab-ind').style.transform = `translateX(${idx * 100}%)`;
  for (const v of ['day', 'week', 'tomorrow']) $(`view-${v}`).classList.toggle('is-active', v === view);
  // on desktop the tomorrow panel is always shown; keep a real view visible in the main column
  if (view === 'tomorrow' && matchMedia('(min-width: 900px)').matches) setView('day');
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

async function refresh() {
  const btn = $('refreshBtn');
  if (btn.disabled) return;
  btn.disabled = true; btn.classList.add('spinning');
  try {
    const r = await fetch('/api/refresh', { method: 'POST' });
    if (!r.ok) throw new Error(r.status);
    await loadData();
    render();
    const s = state.status || {};
    toast(s.timetable?.ok === false || s.ekool?.ok === false ? 'Osa andmeid jäi uuendamata' : 'Andmed uuendatud');
  } catch {
    await loadData().catch(() => {});
    render();
    toast('Värskendamine ebaõnnestus');
  } finally {
    btn.disabled = false; btn.classList.remove('spinning');
  }
}

function findItem(id) { return (state.hw.items || []).find((i) => i.id === id); }
function lessonById(id) {
  const [date] = id.split('|');
  return (state.byDate.get(date) || []).find((l) => lessonId(l) === id);
}

function toggleDone(id) {
  const item = findItem(id);
  if (!item) return;
  state.done[id] = !isDone(item);
  saveDone();
  document.querySelectorAll(`[data-done="${CSS.escape(id)}"]`).forEach((b) => {
    b.setAttribute('aria-checked', String(state.done[id]));
    b.closest('.cl-item')?.classList.toggle('is-done', state.done[id]);
  });
  // re-render everything else after the check animation has played
  setTimeout(() => { renderHeader(); renderDay(); renderWeek(); if (!$('view-tomorrow').contains(document.activeElement)) renderTomorrow(); }, 220);
}

function bind() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  $('prevDay').addEventListener('click', () => stepDay(-1));
  $('nextDay').addEventListener('click', () => stepDay(1));
  $('prevWeek').addEventListener('click', () => stepWeek(-1));
  $('nextWeek').addEventListener('click', () => stepWeek(1));
  $('refreshBtn').addEventListener('click', refresh);
  $('errPill').addEventListener('click', () => toast($('errPill').title.split('\n')[0]));
  $('backdrop').addEventListener('click', closeSheet);

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

  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-done]');
    if (d) { e.preventDefault(); toggleDone(d.dataset.done); return; }
    const c = e.target.closest('[data-lesson]');
    if (c) { const l = lessonById(c.dataset.lesson); if (l) openSheet(l, workFor(l)); return; }
    const it = e.target.closest('[data-item]');
    if (it) {
      const item = findItem(it.dataset.item);
      if (!item) return;
      const l = [...state.work.entries()].find(([, v]) => v.includes(item));
      openSheet(l ? lessonById(l[0]) : null, l ? l[1] : [item]);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closeSheet();
    if (!$('sheet').hidden || e.target.closest('input, textarea')) return;
    if (state.view === 'day' && e.key === 'ArrowLeft') stepDay(-1);
    if (state.view === 'day' && e.key === 'ArrowRight') stepDay(1);
    if (state.view === 'week' && e.key === 'ArrowLeft') stepWeek(-1);
    if (state.view === 'week' && e.key === 'ArrowRight') stepWeek(1);
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

  // keep now/next highlight fresh; reload data when the tab comes back after a while
  setInterval(() => { if (state.date === today()) renderDay(); }, 30_000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (Date.now() - hiddenAt > 10 * 60_000) { await loadData(); render(); }
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
