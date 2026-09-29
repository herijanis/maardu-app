# Brief: tunniplaan fetcher (you also own server.js + scheduler)

Read CLAUDE.md and shared/contract.md first.

1. Find where Maardu Gümnaasium publishes its timetable (maardug.ee / edupage / PDF / Stuudium / eKool…).
   Pick the most reliable machine-readable source for class **11.erh** (lessons, times, teachers, rooms,
   substitutions/asendused if published). Prefer an HTTP/JSON endpoint over a headless browser.
2. `timetable/fetch.js` (`npm run timetable`): write `data/timetable.json` exactly per contract v1, with
   `subjectKey` from `shared/subject.js`. Cover the current and next week. On failure, keep the old file
   and write the error to `data/status.json`.
3. `server.js` (`npm start`, port 4411): serve `web/` at `/`, `/data/<name>.json` (fall back to
   `data/sample/<name>.json` if the real file is missing), `POST /api/refresh` (runs both fetchers:
   `npm run timetable` + `npm run ekool`), and schedule both at 07:00, 12:00 and 19:00 Europe/Tallinn, plus once at startup.
   Also a launchd plist in `timetable/` + README lines to keep it running on the Mac.
4. Test against the real site. Commit + push each piece. When done, reply to the brain with what the source is and a sample of real output.
