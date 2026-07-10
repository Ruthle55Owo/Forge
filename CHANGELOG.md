# Changelog

## v10.0 Forge Athlete Pro — 2026-07-10

### Training intelligence

- Added structured primary/secondary muscle metadata while preserving legacy muscle strings.
- Strengthened recovery, same-session fatigue and stacking explanations.
- Improved best/safe/stretch/avoid target presentation.
- Added template duration, muscle summary and order/volume warnings.
- Added stale-exercise and most-improved views.

### Exercise search and library

- Added word-order-independent fuzzy search, typo tolerance, partial matching and shorthand aliases.
- Added bodyweight, assisted and unilateral exercise handling, including optional per-side volume counting.
- Search now includes aliases, muscles and equipment.
- Added editable aliases, favourites, archive and do-not-recommend controls.
- Corrected pattern classification so leg curls are hamstrings rather than biceps.

### Templates and planning

- Added categories, pinning, duplication, row duplication and reordering.
- Added per-row rest, RPE, RIR, notes and superset groups.
- Added create-from-session support, quick starts, weekly plan and time-cap mode.

### Live workout

- Added copy-last-workout sets, copy-set, exercise reorder, exercise replacement suggestions and undo.
- Added RIR, set notes, exercise notes, pain/discomfort notes and more set types.
- Added a clearer active-workout banner, live fatigue context, superset round-aware rest timing and sticky finish action.
- Preserved auto-save/resume behavior.

### Analytics and methods

- Expanded session duration/density, exercise trends, PR history, muscle load and cardio summaries.
- Expanded the Methods page with formulas, thresholds, limitations and evidence/reference links.

### Data safety and migration

- Added schema 10 migration with a pre-migration safety copy and one-time confirmed full-sync baseline.
- Added consistent timestamps, device IDs and soft deletes.
- Added stable-ID dedupe and conflict-safe merge, including nested session exercise/set merging.
- Kept the existing localStorage key and all existing IDs.

### Sync

- Added manifest checks and incremental record push/pull.
- Retained full backup and chunked pull fallbacks.
- Added retryable chunked full push for large backups, plus chunk retry/progress and failed-chunk diagnostics for pull.
- Added A/B atomic backup slots and a script lock in Apps Script.
- Added post-push manifest confirmation because `no-cors` POST cannot directly expose its response.
- Made manual full push merge-safe so a stale device cannot erase newer cloud-only records.
- Added exact request-ID acknowledgement, frontend/backend version mismatch warnings and detailed diagnostics.

### PWA

- Updated cache to v10.
- Added `version.json` and automatic stale-build warning.
- Improved navigation/offline fallback behavior.

## v9.6

- Existing working two-way Google Sheets sync.
- iPhone-safe chunked pull.
- Smart exercise search and training-target foundations.
