# Brief: never-stale timetable (owner: tunniplaan fetcher)

Goal: the live site always has the latest EduPage timetable, and if it ever can't, we know within hours.
Constraint: EduPage has no CORS, so phones can't fetch it themselves; publishers must.
Don't use anonymizing proxies or anything built to evade EduPage's blocking. Redundancy comes from our OWN sources.

## Layer 1: GitHub Actions (primary)
- Per run: retry with backoff for up to ~4 min.
- Extra attempts: cron every 20 min for 2h after 07/12/19 Tallinn. A run skips if its slot already succeeded
  (track in the Actions cache). New runs usually get a different runner IP.

## Layer 2: the user's Mac (backup publisher, residential IP)
- `timetable/mac-backup.sh` + launchd `ee.maardu-backup` (StartCalendarInterval 07:10/12:10/19:10, plus RunAtLoad
  and wake catch-up). It fetches the live site's status.json. If the live data is older than the latest slot,
  it runs `npm run timetable` locally, and on success pushes `data/timetable.json` to a dedicated branch `snapshots`
  (never main), which triggers the Pages workflow.
- The workflow's data source order: fresh fetch, then the NEWEST of {`snapshots` branch file, Actions cache, live site}.
  Compare by fetchedAt.
- No secrets needed beyond the user's existing gh/git auth. Log: ~/Library/Logs/maardu-backup.log.

## Layer 3: validation (never publish bad data)
- Reject a fetch if: class != 11.erh, fewer than 20 lessons for the covered range, no lessons on a weekday
  that isn't a holiday, or JSON shape invalid. A rejected fetch counts as a failure, and the last good data stays.
- `npm test`: parser tests against saved EduPage fixtures (in timetable/fixtures/), run in the workflow before deploy.

## Layer 4: alarms
- If there's been no successful fetch (from any source) for 12h, the workflow opens a GitHub issue "Tunniplaan ei uuene"
  with the errors (the user gets an email), and comments/closes it on recovery. One open issue at most.
- Watchdog workflow every 3h: reads the LIVE site's status.json/timetable.json and runs the same 12h check,
  so a broken deploy is caught too.

## Layer 5: coverage
- Always fetch current + next week (+ the week after if EduPage has it published), so a missed day
  still shows correct upcoming days.

status.json: timetable { ok, at, error?, lastOk, source: "actions"|"mac"|"cache" }.
Test every layer (simulate the EduPage failure, Mac backup path, alarm open/close) and report evidence.
