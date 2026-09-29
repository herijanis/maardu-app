# Brief: app designer (web UI)

Read CLAUDE.md and shared/contract.md first. You own `web/` (index.html, app.css, app.js; plain HTML/CSS/JS, no build step).
Build against `data/sample/*.json` now (the server serves them at `/data/timetable.json` and `/data/homework.json`).
For standalone testing before server.js exists, `npx serve .` from the repo root and fetch `data/sample/…`, falling back automatically.

The user wants it **super clean, clean dark-mode colors, smooth transitions**. Mobile first (they'll use a phone), great on desktop.

Must have:
1. **Timetable graphic** for 11.erh: day view (default = tomorrow after 15:00, otherwise today) with swipe/arrows between days,
   plus a week grid. Each lesson card shows period, time, subject, room and teacher; mark substitutions (`changed`).
2. **Homework on lessons**: match homework → lesson (same date, then `period` if set, else the first lesson that day with the same `subjectKey`).
   Lessons with work get a clear accent dot or badge (distinct color for `test`). Tapping one opens a smooth bottom sheet with the task details.
3. **"Tomorrow" panel**: everything due tomorrow as a checklist grouped by lesson order, with done state. Homework that matches
   no lesson is still listed ("Muu").
4. Current/next lesson highlight when viewing today. "Updated HH:MM" from fetchedAt, a refresh button → `POST /api/refresh`
   then reload data, and an error pill if `/data/status.json` reports a failure.
5. Design: deep neutral dark background (not pure black), one accent color, soft subject color chips, system font / Inter,
   8px spacing grid, 150–250ms ease transitions, respect `prefers-reduced-motion`. UI text in Estonian.
Commit + push often. When done, reply to the brain with a screenshot path.
