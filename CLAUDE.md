# maardu-app

Maardu Gümnaasium **11.erh** timetable (tunniplaan) as one clean dark-mode web app that works
on any phone with the link. Hosted as a static site on GitHub Pages; a GitHub Actions workflow
refetches the timetable 3x/day (07:00, 12:00, 19:00 Europe/Tallinn) and redeploys.
The eKool homework feature was REMOVED on 2026-09-29 (user request). Don't bring it back.

## Team & ownership (only edit your own area)
| Area | Owner | Path |
|---|---|---|
| Shared contract, CLAUDE.md, `shared/` | brain | `CLAUDE.md`, `shared/`, `data/sample/` |
| Timetable fetcher, local dev server, GitHub Actions deploy | tunniplaan fetcher | `timetable/`, `server.js`, `.github/`, `package.json` |
| Web UI | app designer | `web/` |

Need a contract change? Ask the brain, don't edit `shared/` yourself.

## Stack
- Node 24, ESM. No runtime dependencies.
- `npm run timetable`: writes `data/timetable.json` (public EduPage JSON, no login).
- Production: GitHub Pages. The site is `web/` plus `data/timetable.json` (and `data/status.json`), and
  the UI fetches `data/timetable.json` by RELATIVE path. There is no backend, so no /api calls.
- `npm start`: local dev server on :4411 serving the same layout.

## Data contract (see `shared/contract.md` for full schema)
- `shared/subject.js` exports `subjectKey(name)`, used for subject colors.

## Rules
- No secrets in this app. Never commit `.env`, `data/*.json` or browser profiles.
- Commit and push often: one logical change per commit, clear message, only your files.
  Pull/rebase before pushing. Never force-push.
