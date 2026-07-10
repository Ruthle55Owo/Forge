# Forge Athlete Pro v10.0

A local-first personal training PWA for strength workouts, templates, supersets, progression targets, recovery/fatigue context, cardio, body logs, planning and Google Sheets sync.

## Build information

- Frontend: **v10.0 Forge Athlete Pro**
- Backend: **v10.0 Apps Script**
- Schema: **10**
- Build date: **2026-07-10**
- Storage key: **`forge_fitness_tracker_v5`** (intentionally unchanged)

## Package contents

- `index.html` — complete frontend.
- `manifest.json`, `sw.js`, `version.json` — PWA files.
- `icon-180.png`, `icon-192.png`, `icon-512.png` — icons.
- `google-apps-script.gs` — v10 Google Sheets backend.
- `.nojekyll` — GitHub Pages compatibility.
- `AUDIT.md` — audit of the supplied v9.6 app and backup.
- `CHANGELOG.md` — build changes.
- `MIGRATION_NOTES.md` — schema/data safety details.
- `TEST_PLAN.md` — automated results and manual acceptance checklist.
- `ROADMAP.md` — recommended long-term architecture.

No personal backup JSON or sync token is included in the deployable package.

## Safe upgrade sequence

1. In the current app, export a fresh JSON backup and keep it outside GitHub.
2. Upload all website files in this package to the GitHub Pages repository root.
3. Keep the empty `.nojekyll` file in the root.
4. Open the Google Sheet used by Forge → **Extensions → Apps Script**.
5. Replace the script with `google-apps-script.gs`.
6. Change `SECRET_TOKEN` to the same private token already entered in Forge Settings. Never commit the token to GitHub.
7. Save, then **Deploy → Manage deployments → Edit → Version: New version → Deploy**.
8. Open the website in a normal laptop browser. Confirm Settings reports frontend v10.0.
9. Run **Sync Diagnostics**. Backend must report v10.0.
10. On the device with the newest complete data, press **Push full backup** once and wait for cloud confirmation.
11. On iPhone, open the site in Safari and reload once. Then reopen/add the Home Screen app.
12. Pull and confirm session/template counts before doing normal two-device use.

## Data safety behavior

- Existing IDs and the existing storage key are preserved.
- The first schema-10 migration creates a local safety copy.
- Import creates a safety copy before merge.
- Cloud merge matches records by stable ID and timestamps.
- Deletion uses tombstones rather than absence.
- A failed import, migration, push or pull never wipes local records.
- The active workout remains local during cloud pull.
- Full JSON export and full cloud backup remain available even with incremental sync enabled.

## Sync model

Routine sync uses:

1. A lightweight cloud manifest check.
2. Record-level incremental push/pull where timestamps are reliable.
3. Stable-ID merge with soft deletes, including nested session sets.
4. Chunked full push for large backups and chunked full pull as the restore fallback.
5. A/B backup slots in Sheets so an interrupted cloud write does not replace the last known-good snapshot.
6. Merge-safe full pushes so a stale device cannot erase newer cloud-only records.
7. Exact `requestId` acknowledgement in the cloud manifest before a browser marks a push successful.

Because browser `no-cors` POST cannot reveal the Apps Script response directly, v10 confirms a push by polling the manifest for the exact request ID. Large full backups are split into retryable chunks and committed only after every chunk is present. An unconfirmed request remains marked pending; local data is still safe.

## GitHub Pages

The repository root should contain at least:

```text
.nojekyll
index.html
manifest.json
version.json
sw.js
icon-180.png
icon-192.png
icon-512.png
```

The documentation and Apps Script file may remain in the repository as well.

## Important limitations

- Recovery and target recommendations are transparent coaching heuristics, not medical advice.
- Machine stack values are not comparable across different machines or gyms.
- Google Sheets is appropriate for a personal app but not a high-concurrency multi-user service.
- The frontend remains a large single file to reduce migration/deployment risk. IndexedDB and modular source files are the recommended next architecture.
- The kg/lb preference is stored, but automatic historical value conversion is not implemented in this build.
- Routine delta transfer is network-efficient, but the current Apps Script still rebuilds the consolidated cloud snapshot/Sheets tables after a successful write; server work therefore grows with the database.
