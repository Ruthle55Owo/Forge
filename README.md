# Forge Athlete — v7 Senior Build

Local-first workout tracker PWA with optional two-way Google Sheets sync.

## New in v7

- Expanded 200-exercise library with cleaned names for the user's current lifts.
- Smarter next-target logic using last workout, rep range, trend, stacked exercise order, same-muscle fatigue, and superset context.
- Overtime goals: the app gives a 4-week style progression aim, not only a next-session number.
- Preset workout/template builder inside the app.
- Superset groups A/B/C/D/E in both templates and live workout logging.
- Save active workout or last finished workout as a reusable template.

## Files to upload to GitHub Pages

Upload these to the root of the repo:

- `index.html`
- `manifest.json`
- `sw.js`
- `.nojekyll`
- `README.md`
- `icon-180.png`
- `icon-192.png`
- `icon-512.png`

Do not upload workout backup JSON files or any file containing your Google Sheets sync token.

## Apps Script

Keep using `google-apps-script.gs` for the Google Sheets sync. The sync stores the whole Forge JSON, so the new template/superset fields are included automatically.

After replacing website files, hard refresh the site once. On mobile, reopen the Home Screen app. If the old version is stuck, clear site data or change the `?v=forge-v7` start URL/cache version.
