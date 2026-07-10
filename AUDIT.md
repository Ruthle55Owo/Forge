# Forge Athlete v9.6 → v10.0 audit

Audit date: 2026-07-10  
Source reviewed: the supplied frontend/PWA files, Apps Script backend, and the 2026-07-10 backup.

## 1. Existing architecture

- **Frontend:** one large, dependency-free `index.html` containing CSS, HTML templates, application logic and the built-in exercise seed.
- **Persistence:** browser `localStorage` under **`forge_fitness_tracker_v5`**.
- **Offline:** service worker caches the app shell.
- **Cloud:** Google Apps Script + Google Sheets, with full-database push and JSONP/iframe/chunked pull fallbacks.
- **Data model:** a top-level database object containing settings, exercises, templates, sessions, cardio, body logs, goals and an active session.
- **Training logic:** Epley estimated 1RM, double progression, best/safe/stretch/avoid targets, recent muscle load, recovery scoring and live stacking context.

Keeping the existing storage key is deliberate. Changing it would make an existing installation look empty until data was imported.

## 2. Backup inventory and integrity

The supplied v9 backup contains:

| Collection | Count |
|---|---:|
| Exercises | 200 |
| Templates | 7 |
| Sessions | 14 |
| Sets | 232 |
| Body/recovery logs | 4 |
| Goals | 6 |
| Active session | Present, with no exercises |

Integrity checks found:

- No duplicate exercise IDs.
- No duplicate template IDs.
- No duplicate session IDs.
- No duplicate set IDs.
- No missing exercise references in templates or sessions.
- One suspicious empty historical session: **“Upper + Legs A”**, started 2026-06-15 and ended 2026-06-19 with zero exercises. It is preserved rather than silently deleted.
- Historical display names contain harmless spelling/casing variations such as “Incline DB Press” and “maxhie chest fly”. Stable exercise IDs remain the source of truth.

## 3. Version/build drift

The supplied package had several version labels at once:

- Browser title: v9.5.
- Visible build badge: v9.6.
- Frontend constant: v9.6.
- Seed database version: 7.
- Migrated database version: 9.
- Service-worker cache: v9.6.

This made stale-cache diagnosis harder. v10 centralises build metadata in the UI and adds `version.json` for an automatic cached-PWA warning.

## 4. Schema audit

### Exercise

Existing fields: `id`, `name`, `muscle`, `equipment`, `notes`, `goalMin`, `goalMax`, `increment`, `sticky`.

Risks:

- A single slash-separated `muscle` string is ambiguous for training-load calculations.
- Aliases were not consistently user-editable.
- No archive/favourite/do-not-recommend state.
- No timestamps, so record-level conflict resolution was not reliable.

### Template

Existing fields: `id`, `name`, `notes`, and rows containing `exerciseId`, `target`, `rest`, `groupId`.

Risks:

- Rows did not have stable IDs.
- No category, time cap, pinning, per-row RPE/RIR or row notes.
- Reordering/duplication and stacking warnings were limited.

### Session and set

Session fields: `id`, `name`, `date`, `start`, `end`, `notes`, `exercises`.  
Set fields: `id`, `weight`, `reps`, `rpe`, `done`, `type`, sometimes `completedAt`.

Risks:

- No consistent record timestamps or soft-delete markers.
- Session exercise rows had no stable row ID.
- No RIR, set notes or exercise pain/discomfort note.
- Full-database conflict handling could not reliably determine which device changed a record most recently.

### Active workout

The active session was stored inside the same local database. This is good for crash recovery, but it should remain local during cloud merge so an unfinished phone workout cannot be overwritten by another device.

## 5. Search audit

The prior build already had a useful smart-search foundation, but it was still tied to fixed normalization and a vague muscle string. It lacked a complete editable alias model and robust structured muscle/equipment matching. Tests needed to explicitly cover misspellings and gym shorthand.

v10 adds:

- Word-order-independent token matching.
- Typo tolerance.
- Partial-word matching.
- Gym shorthand and phrase aliases.
- Search against aliases, primary muscles, secondary muscles and equipment.
- Editable per-exercise aliases.

## 6. Muscle-classification audit

The prior code had a specific safeguard against treating every word “curl” as biceps, which was good. However, the overall model still derived load from broad keywords and one text field. This could distort fatigue and weekly-volume summaries.

v10 keeps the legacy `muscle` string for compatibility and adds structured `primaryMuscles` and `secondaryMuscles`. Leg curls are explicitly hamstrings; arm curls are biceps/brachialis; presses, pulls, hinges, squats and raises receive exercise-pattern-aware tags.

## 7. Sync audit

### What already worked

- Local-first saves.
- Manual full backup/export.
- Full Google Sheets push.
- Multiple pull fallbacks, including chunked pull for iPhone.
- Stable top-level IDs in the user data.

### Risks in the prior design

- Routine push sent the whole database.
- Pull could transfer the whole database even when nothing changed.
- Most records lacked `updatedAt`, so newest-wins merge was unsafe.
- Deletion had no tombstone, so absence could be mistaken for deletion.
- A full backup write used one logical latest copy, making interrupted writes harder to distinguish.
- Browser `no-cors` POST cannot directly expose the backend response to JavaScript.
- Version mismatch and cloud size/count diagnostics were limited.

### v10 response

- Incremental delta push/pull by stable ID and timestamps.
- Tiny manifest check before a pull.
- Soft deletes (`deletedAt`) and device IDs.
- Full chunked pull retained as a tested fallback and restore path; large full pushes are now chunked and committed only after all pieces are present.
- A/B cloud backup slots: write the inactive slot completely, then switch the active pointer.
- Script lock to prevent simultaneous cloud writes.
- Post-push manifest confirmation using the exact request ID; if confirmation is unavailable, Forge leaves the change marked pending and never alters local data.
- Expanded diagnostics for counts, size, method, duration, pending changes, backend version and failed chunk.

## 8. UI/QOL audit

Strong existing areas included a mobile layout, minimum 44-pixel controls, active-session auto-save, targets, basic analytics, templates and supersets.

Main gaps addressed in v10:

- Faster searchable pickers everywhere.
- Template duplicate/reorder/pin/category/time-cap controls.
- One-tap quick starts and repeat-last-workout.
- Copy prior set/workout data, RIR and more set types.
- Undo for destructive workout/library actions.
- Weekly plan and time-cap mode.
- Clear offline/sync/build state.
- A proper About/changelog page and expanded Methods page.

## 9. Maintainability risks that remain

- The application is still a large single-file frontend. This preserves deployment simplicity, but future work should split data, UI, analytics and sync into modules with automated tests.
- `localStorage` serializes the full database on each save. It is acceptable at the current dataset size, but IndexedDB is the safer next step for years of logs.
- Google Sheets is practical for one user, not a high-concurrency multi-user backend. Delta transfer reduces network payload, but Apps Script still rebuilds the consolidated snapshot/tables after each accepted write.
- The weight-unit preference does not yet convert existing values between kg and lb; it is not presented as a completed conversion system.
- The training scores are transparent heuristics, not medical or injury advice.
