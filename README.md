# Forge Athlete — Two-Way Google Sheets Sync PWA

This version is local-first but can use Google Sheets/Drive as the shared sync source.

## What changed

- Auto-pull latest cloud backup when Forge opens.
- Manual **Pull latest now** button.
- Auto-push full data after saved workout/cardio/body logs.
- Manual **Push all data now** button.
- Merge logic so phone + laptop can both keep their own local copy while sharing through the same Google Sheet backup.
- Secret token and Apps Script URL stay only in each device's local storage.

## Upload these to GitHub Pages

Upload these files to the root of your GitHub Pages repo:

- `index.html`
- `manifest.json`
- `sw.js`
- `.nojekyll`
- `README.md`
- `icon-180.png`
- `icon-192.png`
- `icon-512.png`

Do not upload workout backup JSON files.

## Apps Script update

You must replace your current Apps Script code with the new `google-apps-script.gs` in this package, then deploy a **new version** of the web app.

Settings:

- Execute as: **Me**
- Who has access: **Anyone**

Then copy the `/exec` URL into Forge Settings with the same secret token.

## Recommended flow

1. Use your iPhone Home Screen Forge app as the main logger.
2. After each workout, Forge saves locally and pushes to Sheets.
3. When you open Forge on laptop, it pulls latest from Sheets automatically.
4. Still export JSON sometimes for emergency full restore.
