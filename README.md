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
