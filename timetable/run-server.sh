#!/bin/zsh
# Started by launchd (see timetable/ee.maardu-app.plist). launchd has a bare PATH, so add the usual node locations.
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "${0:A:h}/.." || exit 1
exec node server.js
