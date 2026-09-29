# Data contract v1

## data/timetable.json
```json
{
  "class": "11.erh",
  "source": "https://…",               // where it was fetched from
  "fetchedAt": "2026-09-29T07:00:03+03:00",
  "from": "2026-09-28", "to": "2026-10-18",   // covered range: 3 weeks Mon..Sun (school breaks/holidays dropped)
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

## data/status.json
```json
{ "timetable": {
    "ok": true,                         // deployed data was fetched at/after the latest 07/12/19 slot
    "at": "2026-09-29T22:54:12+03:00",  // when this status was written
    "error": "fetch failed ETIMEDOUT",  // optional: last Actions fetch error (may appear even when ok is true)
    "lastOk": "2026-09-29T22:49:33+03:00", // fetchedAt of the deployed data
    "source": "actions"                 // actions | mac | cache | live
} }
```
Publishers never overwrite good data with a failed or invalid fetch. The UI only warns when `lastOk` is more than 12h old.
