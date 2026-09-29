# Brief: eKool connector

Read CLAUDE.md and shared/contract.md first. Code goes in `ekool/` in ~/maardu-app.

1. Log in to eKool (https://ekool.eu / the new eKool app API) with EKOOL_USER / EKOOL_PASS from `.env`
   (add a tiny .env loader or use `node --env-file`). If the login needs Smart-ID/Mobiil-ID/ID-card, stop and ask
   the user. Prefer the JSON API the web app itself uses over scraping HTML. Save the session token under `data/`
   (gitignored) so we don't log in every run.
2. `ekool/fetch.js` (`npm run ekool`): write `data/homework.json` per contract v1: homework, tests and tasks due today
   through the next 7 days, with subject, `subjectKey` (from `shared/subject.js`), lesson number if available, title,
   full description and done state. On failure, keep the old file and write the error to `data/status.json`.
3. Ask the user for credentials yourself (they fill in `.env`). Never commit secrets or tokens.
4. Test with the real account. Commit + push. When done, reply to the brain with a redacted sample of real output
   and the list of subject names eKool uses, so we can check they match the timetable's.
