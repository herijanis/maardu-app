# maardu-app

Maardu Gümnaasium 11.erh timetable as a web app that works on any phone (GitHub Pages). See `CLAUDE.md` for the team setup.

```sh
npm start            # http://localhost:4411, fetches at 07:00, 12:00, 19:00 (Europe/Tallinn) and on start
npm run timetable    # data/timetable.json from mgm.edupage.org
curl -X POST localhost:4411/api/refresh   # run the fetcher now
```

## Production: GitHub Pages

`.github/workflows/pages.yml` runs `npm run timetable` at 07:00, 12:00 and 19:00 Europe/Tallinn (and on every
push to main or a manual run) and deploys `web/` + `data/timetable.json` + `data/status.json` to Pages. EduPage times out from some
GitHub runner IPs, so each slot is retried at :15, :30 and :45 until one run fetches successfully.
If EduPage fails, it redeploys the last good timetable (Actions cache, else the live site) with
`status.json` saying `ok: false`. Needs Settings → Pages → Source: GitHub Actions.

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
