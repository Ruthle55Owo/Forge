# Forge Athlete v9.4 — Pull Diagnostics + Fuzzy Exercise Search

This build is for the exact issue: phone can push but cannot pull, plus it makes the app version visible and improves exercise search.

## New in v9.4

- Visible app build badge in the sidebar and Settings.
- Sync diagnostics page/button still tests backend ping + pull.
- Pull uses JSONP first, then iframe/postMessage fallback.
- Apps Script stores the latest full backup in the Sheet itself in `LatestBackup` chunks.
- Exercise search is now word-order flexible: `extension single leg`, `single extension`, `leg ext`, `lat raise cable`, and typo `extention` work much better.

## Critical sync step

You must replace the Apps Script code with the v9.4 `google-apps-script.gs` and deploy a **new version** of the web app. Editing Code.gs without deploying a new version can leave the phone using the old backend.

## Upload to GitHub Pages

Upload/replace these files at the repo root:

- `index.html`
- `manifest.json`
- `sw.js`
- `.nojekyll`
- `README.md`
- `google-apps-script.gs`
- `icon-180.png`
- `icon-192.png`
- `icon-512.png`

Do not upload workout backup JSON files.

## Phone pull test

In Forge Settings on the phone:

1. Check the app build shows v9.4.
2. Press `Run diagnostics`.
3. Press `Open pull URL`.
4. If the browser response says `Bad or missing token`, the phone token is wrong.
5. If it says `db:null`, push once from the main device first.
6. If it shows old/non-v9.4 text, Apps Script was not redeployed as a new version.
