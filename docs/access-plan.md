# Timetable access plan: every route, all of them legitimate

Goal: the 11.erh timetable on https://herijanis.github.io/maardu-app/ is always the latest version.
Rule: we only use public data the school publishes, through channels we own. No proxies, no anonymizers,
no logins that aren't ours, no load on EduPage beyond a few requests a few times a day.

## 1. Where the timetable lives (source of truth)
| Source | What it is | Status |
|---|---|---|
| EduPage `mgm.edupage.org/timetable/` (RPC: ttviewer, regulartt, currenttt) | The official timetable. mgm.ee links only here. | **Primary.** Public, no login. |
| EduPage substitution viewer (`/substitution/`) | Daily changes (asendused) | Read on each fetch, merged as `changed` + `note` |
| New weekly version ("Tunniplaan 28.09 - 02.10") | The school publishes next week in advance | Fetch current + next (+ following) week |
| eKool | Links to the same EduPage timetable | Not a separate source (removed) |

There is no CORS on EduPage, so browsers/phones cannot read it directly: a *publisher* must fetch it and
write `data/timetable.json` to the site.

## 2. Publishers (independent networks we control)
| # | Publisher | Network | When | State |
|---|---|---|---|---|
| A | GitHub Actions workflow | GitHub datacenter (varies per run) | 07/12/19 Tallinn + retries every 20 min for 2h | Built; hardening in progress |
| B | The user's Mac (`ee.maardu-backup`) | Home internet | 07:10/12:10/19:10 + on wake, only if the site is stale | In progress |
| C | Cloudflare Worker cron (optional) | Cloudflare edge | Same slots, writes to the `snapshots` branch via a GitHub token | Needs the user's free Cloudflare account + a fine-grained token |
| D | iPhone Shortcut / Android automation (optional) | Mobile network | Manual button or daily automation; posts to the `snapshots` branch | Needs a token on the phone |

All publishers write to the `snapshots` branch. The Pages workflow always deploys the **newest valid** data
from {fresh fetch, snapshots, Actions cache, currently live site}, compared by `fetchedAt`.

## 3. Safety nets
- **Validation:** wrong class, too few lessons, empty weekdays or bad shape → rejected, and the last good data stays live.
- **Parser tests** on saved EduPage fixtures run before every deploy, so a format change is caught, not published.
- **Alarm:** no successful fetch from ANY publisher for 12h → GitHub issue "Tunniplaan ei uuene" (the user gets an email); auto-closed on recovery.
- **Watchdog:** every 3h it checks the live site itself, so broken deploys are caught too.
- **UI honesty:** the app shows "Tunniplaan võib olla vananenud" + the last-updated time only when data is >12h old.

## 4. If everything fails
If EduPage itself is down or changes completely, no publisher can get new data. The site keeps the last good
timetable (which covers the next 1–2 weeks), the alarm fires, and the fix is a parser update. The fixtures and
tests make that a small job.
