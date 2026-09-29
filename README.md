# maardu-app

Maardu Gümnaasium 11.erh timetable as a web app that works on any phone (GitHub Pages). See `CLAUDE.md` for the team setup.

```sh
npm start            # http://localhost:4411, fetches at 07:00, 12:00, 19:00 (Europe/Tallinn) and on start
npm run timetable    # data/timetable.json from mgm.edupage.org
curl -X POST localhost:4411/api/refresh   # run the fetcher now
```

## Production: GitHub Pages

`.github/workflows/pages.yml` runs `npm run timetable` at 07:00, 12:00 and 19:00 Europe/Tallinn (and on every
push to main or a manual run) and deploys `web/` + `data/timetable.json` + `data/status.json` to Pages.
If EduPage fails, it redeploys the last good timetable (Actions cache, else the live site) with
`status.json` saying `ok: false`. Needs Settings → Pages → Source: GitHub Actions.

## Keep the local server running on the Mac (launchd, optional)

```sh
sed -e "s|__APP_DIR__|$PWD|g" -e "s|__HOME__|$HOME|g" timetable/ee.maardu-app.plist > ~/Library/LaunchAgents/ee.maardu-app.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ee.maardu-app.plist
```

Log: `~/Library/Logs/maardu-app.log`. Restart after a `git pull`: `launchctl kickstart -k gui/$(id -u)/ee.maardu-app`.
Remove: `launchctl bootout gui/$(id -u)/ee.maardu-app && rm ~/Library/LaunchAgents/ee.maardu-app.plist`.
