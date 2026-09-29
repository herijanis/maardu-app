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

## Errors
If a fetch fails, keep the last good file and write `data/status.json`:
`{ "timetable": { "ok": false, "at": "...", "error": "..." } }`
