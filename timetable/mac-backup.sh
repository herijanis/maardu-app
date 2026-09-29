#!/bin/zsh
# Mac backup publisher, started by launchd (timetable/ee.maardu-backup.plist). See timetable/backup.js.
# launchd has a bare PATH, so add the usual node/gh locations.
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "${0:A:h}/.." || exit 1
exec node timetable/backup.js "$@"
