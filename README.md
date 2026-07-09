# Forge Athlete v9.5 Sync Debug + Fuzzy Search

This build adds a visible app version, stricter backend version diagnostics, clearer pull-failure messages, and word-order flexible exercise search.

## Critical sync setup

Replace Apps Script with `google-apps-script.gs`, set `SECRET_TOKEN`, then deploy a **new version** of the web app. Push once from the main device so the `LatestBackup` sheet is populated, then pull on the phone.
