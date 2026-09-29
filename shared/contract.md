# Data contract v1

## data/timetable.json
```json
{
  "class": "11.erh",
  "source": "https://…",               // where it was fetched from
  "fetchedAt": "2026-09-29T07:00:03+03:00",
  "periods": [ { "period": 1, "start": "08:15", "end": "09:00" } ],
  "lessons": [
    {
      "date": "2026-09-30",            // YYYY-MM-DD, concrete date (cover this week + next week if available)
      "weekday": 3,                     // 1=Mon … 5=Fri
      "period": 1,
      "start": "08:15", "end": "09:00",
      "subject": "Matemaatika",         // as displayed by the school
      "subjectKey": "matemaatika",      // subjectKey(subject)
      "teacher": "A. Tamm",             // or null
      "room": "204",                    // or null
      "group": null,                    // e.g. "rühm 1" for split classes, or null
      "changed": false,                 // true if it's a substitution/change (asendus)
      "note": null
    }
  ]
}
```

## data/homework.json
```json
{
  "fetchedAt": "2026-09-29T07:00:10+03:00",
  "items": [
    {
      "id": "ekool-123456",             // stable id
      "date": "2026-09-30",             // the day it is DUE (the lesson it belongs to)
      "subject": "Matemaatika",
      "subjectKey": "matemaatika",      // subjectKey(subject)
      "period": null,                   // lesson number if eKool gives it, else null
      "type": "homework",               // homework | test | task | other
      "title": "Lk 42 ül 3-7",
      "description": "…full text…",     // may be ""
      "done": false,                    // or null if unknown
      "url": null
    }
  ]
}
```
Include everything due from today through the next 7 days; the UI focuses on tomorrow.

## Errors
If a fetch fails, keep the last good file and write `data/status.json`:
`{ "timetable": { "ok": false, "at": "...", "error": "..." }, "ekool": { "ok": true, "at": "..." } }`
