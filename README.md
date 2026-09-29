# maardu-app

> **⚠ Yearly reminder: update `timetable/holidays.js` before 2027-09-01.** EduPage keeps showing lessons
> through school breaks and public holidays, so this list is what hides them. It covers the 2026/27 school year
> only (`COVERED_UNTIL = '2027-08-31'`). Add the 2027/28 breaks (mgm.ee/teenused → "Koolivaheajad") and public
> holidays, bump `COVERED_UNTIL`, run `npm test`. Past that date nothing is hidden and validation skips the
> empty-weekday check.

Maardu Gümnaasium 11.erh timetable as a web app that works on any phone (GitHub Pages). See `CLAUDE.md` for the team setup.

```sh
npm start            # http://localhost:4411, fetches at 07:00, 12:00, 19:00 (Europe/Tallinn) and on start
npm run timetable    # data/timetable.json from mgm.edupage.org
npm test             # parser/validation/publish/alarm tests
curl -X POST localhost:4411/api/refresh   # run the fetcher now
```

## Production: GitHub Pages (see team/reliability.md)

`.github/workflows/pages.yml` fetches the timetable at 07:00, 12:00 and 19:00 Europe/Tallinn and deploys `web/` +
`data/timetable.json` + `data/status.json`. EduPage times out from some GitHub runner IPs, so:
- each run retries with backoff for ~4 min, and each slot gets an attempt every 20 min for ~2h until one succeeds;
- if the fetch fails it deploys the NEWEST valid copy of: the Mac's `snapshots` branch, the Actions cache, the live site;
- data is validated before it's published (`timetable/validate.js`; `npm test` runs in the workflow);
- `status.json`: `{ timetable: { ok, at, error?, lastOk, source: actions|mac|cache } }`.

Alarms: after 12h without a successful fetch the issue "Tunniplaan ei uuene" is opened (you get an email) and it is
closed on recovery. `watchdog.yml` re-checks the live site every 3h.
Test the fallback: run the Pages workflow with `simulate_edupage_down`; test the alarm: run the watchdog with
`fake_last_ok` (e.g. `2026-09-28T07:00:00+03:00`), then without it to close the issue.

## Mac backup publisher (launchd)

EduPage blocks some GitHub runner IPs, so this Mac is a backup: at 07:10/12:10/19:10, on load and every 30 min
`timetable/mac-backup.sh` checks the live site, and if its data is older than the latest slot it fetches from here,
pushes `data/timetable.json` to the `snapshots` branch and starts the Pages workflow (which deploys the newest source).

```sh
sed -e "s|__APP_DIR__|$PWD|g" -e "s|__HOME__|$HOME|g" timetable/ee.maardu-backup.plist > ~/Library/LaunchAgents/ee.maardu-backup.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ee.maardu-backup.plist
```

Log: `~/Library/Logs/maardu-backup.log`. Test: `timetable/mac-backup.sh --force --simulate-actions-down`.

## Keep the local server running on the Mac (launchd, optional)

```sh
sed -e "s|__APP_DIR__|$PWD|g" -e "s|__HOME__|$HOME|g" timetable/ee.maardu-app.plist > ~/Library/LaunchAgents/ee.maardu-app.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ee.maardu-app.plist
```

Log: `~/Library/Logs/maardu-app.log`. Restart after a `git pull`: `launchctl kickstart -k gui/$(id -u)/ee.maardu-app`.
Remove: `launchctl bootout gui/$(id -u)/ee.maardu-app && rm ~/Library/LaunchAgents/ee.maardu-app.plist`.
