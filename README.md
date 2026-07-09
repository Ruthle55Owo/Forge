# Forge Athlete v9 — Comprehensive Coach Build

This is the comprehensive trainer version.

## New in v9

- Coach page: overall readiness, train-today suggestions, careful muscles, weekly muscle load, and deload flags.
- Recovery check-ins: sleep, energy, soreness, stress, protein, calories, steps, notes.
- Recovery now affects exercise targets, not only previous set performance.
- Muscle readiness uses recent same-muscle sets, last-hit timing, recent RPE, and body readiness.
- Cardio health-minutes estimate: moderate minutes + 2 × vigorous minutes.
- Methods page: shows the actual formulas used by the app.
- Keeps v8 live fatigue: same-muscle/superset sets already done during the current workout adjust today’s targets.

## Core formulas

- Set volume = weight × reps.
- Session volume = sum of completed set volume.
- Estimated 1RM = weight × (1 + reps / 30).
- Today target = min(recovery score, live-session fatigue score).
- Target bands: 90+ stretch, 75–89 best, 60–74 safe, <60 repeat/reduce.
- Weekly cardio health-minutes = moderate minutes + 2 × vigorous minutes.

## Push to GitHub Pages

Upload these files to the root of your GitHub Pages repo:

- index.html
- manifest.json
- sw.js
- .nojekyll
- README.md
- icon-180.png
- icon-192.png
- icon-512.png
- google-apps-script.gs

Do not upload workout backup JSON files.

## Important

Readiness scoring is a coaching heuristic, not a medical diagnosis or injury prediction model. It is designed to make progression smarter by combining performance history, recent load, live fatigue, and recovery check-ins.


## v9.1 Sync Pull Fix

This patch keeps the same Forge app UI, but replaces the Google Apps Script sync backend with a more robust pull system.

Why: older sync saved the readable Sheets tabs and the latest full JSON through Drive. Some devices could push visible rows but fail to pull because the full backup file was missing, old, or inaccessible. v9.1 stores the latest full Forge database inside the spreadsheet itself in safe chunks, then `pullLatest` rebuilds it from the `LatestBackup` tab.

After uploading the new files, also replace your Apps Script code with the included `google-apps-script.gs`, set `SECRET_TOKEN`, and deploy a new web app version.

Test in a browser with:

`/exec?action=pullLatest&token=YOUR_TOKEN`

Expected result: `{"ok":true,"db":{...}}` or `{"ok":true,"db":null}` before the first successful push.


## v9.2 Muscle token fix

Fixed an important Coach/readiness bug where any exercise name containing "curl" was counted as biceps. This meant Leg Curl / Seated Leg Curl / Nordic Hamstring Curl could incorrectly mark biceps as recently trained. Forge now treats lower-body curls as hamstrings and only counts biceps when the exercise metadata or name clearly indicates an arm curl.
