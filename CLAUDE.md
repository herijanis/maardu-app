# maardu-app

Maardu Gümnaasium **11.erh** timetable (tunniplaan) + eKool homework for tomorrow,
shown as one clean dark-mode web app. Refreshed 3x/day (07:00, 12:00, 19:00 Europe/Tallinn).

## Team & ownership (only edit your own area)
| Area | Owner | Path |
|---|---|---|
| Shared contract, CLAUDE.md, `shared/` | brain | `CLAUDE.md`, `shared/`, `data/sample/` |
| Timetable fetcher + server + scheduler | tunniplaan fetcher | `timetable/`, `server.js`, `package.json` scripts |
| eKool connector | ekool connector | `ekool/` |
| Web UI | app designer | `web/` |

Need a contract change? Ask the brain, don't edit `shared/` yourself.

## Stack
- Node 24, ESM (`"type": "module"`). Few dependencies; add only what you need to root `package.json`.
- `npm run timetable`: writes `data/timetable.json`
- `npm run ekool`: writes `data/homework.json`
- `npm start`: `server.js` serves `web/` at `/` and `data/*.json` at `/data/*.json` on
  http://localhost:4411, and runs both fetchers at 07:00, 12:00 and 19:00 (and once on start).
  `POST /api/refresh` runs both now.
- The UI reads `/data/timetable.json` and `/data/homework.json`. Until real data exists,
  use `data/sample/*.json` (the server falls back to them when the real file is missing).

## Data contract (see `shared/contract.md` for full schema)
- `shared/subject.js` exports `subjectKey(name)`. Both fetchers MUST set `subjectKey` using it
  so homework matches lessons.
- Homework → lesson matching (UI does this): same `date`, then same `period` if homework has
  one, otherwise the first lesson that day with the same `subjectKey`.

## Rules
- Secrets live in `.env` only (EKOOL_USER, EKOOL_PASS, ...). Never commit `.env`, `data/*.json`,
  browser profiles or cookies.
- Commit and push often: one logical change per commit, clear message, only your files.
  Pull/rebase before pushing. Never force-push.
