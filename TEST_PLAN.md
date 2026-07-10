# Forge Athlete v10 test plan

## Automated checks completed for this package

- [x] Frontend JavaScript syntax check.
- [x] Service-worker JavaScript syntax check.
- [x] Apps Script JavaScript syntax check.
- [x] Apps Script nested set merge test.
- [x] Apps Script merge-safe full push test.
- [x] Apps Script tombstone-newest test.
- [x] Frontend contains retryable chunked full-push/status/commit path.
- [x] Apps Script contains chunk storage, missing-chunk status and atomic full-commit handlers.
- [x] Load the supplied v9 backup in a DOM/localStorage test harness.
- [x] Migrate to schema 10 without throwing.
- [x] Preserve 200/200 exercise IDs.
- [x] Preserve 7/7 template IDs.
- [x] Preserve 14/14 session IDs.
- [x] Preserve 232/232 set IDs.
- [x] Create one pre-v10 safety backup.
- [x] Mark a v9 upgrade as requiring one confirmed full-sync baseline.
- [x] Render all app pages in the test harness.
- [x] Confirm leg-curl primary classification is hamstrings and not biceps.
- [x] Search `extension single leg`.
- [x] Search `extention single`.
- [x] Search `leg ext`.
- [x] Search `ham curl`.
- [x] Search `lat raise cable`.
- [x] Search `rear fly`.
- [x] Search `incl db press`.
- [x] Search `ohp db`.
- [x] Search `tri pushdown`.
- [x] Search `bss`.
- [x] Search `rdl`.
- [x] Search `sl leg ext`.
- [x] Search `bayesian curl`.
- [x] Search `pull down`.

Automated migration result: **200 exercises, 7 templates, 14 sessions, 232 sets preserved**.

## Manual browser acceptance test

Run this first on a laptop copy of the GitHub Pages site, then on iPhone Safari/Home Screen.

### Upgrade and data

- [ ] Export the current v9 backup before deployment.
- [ ] Open v10 and confirm the dashboard/history/templates match the old app.
- [ ] Confirm the suspicious empty session remains present rather than being silently removed.
- [ ] Refresh and reopen the PWA; confirm data remains.
- [ ] Settings shows frontend v10.0, schema 10, build date and the existing storage key.

### Search/library

- [ ] Repeat all search cases listed above in live workout, template builder, library and progress.
- [ ] Add/edit a custom alias and confirm it becomes searchable.
- [ ] Favourite, archive and restore an exercise.
- [ ] Confirm archived exercises do not appear in normal pickers.

### Template builder

- [ ] Create and rename a template.
- [ ] Search and add an exercise.
- [ ] Duplicate and reorder a row.
- [ ] Assign superset groups A/B/C/D.
- [ ] Set rest, target, RPE, RIR and notes.
- [ ] Pin and duplicate the template.
- [ ] Confirm duration, muscle summary and warnings update.
- [ ] Delete a template and use Undo.

### Live workout

- [ ] Quick-start from a template.
- [ ] Repeat the previous workout.
- [ ] Add an exercise using fuzzy search.
- [ ] Copy the previous set and previous workout sets.
- [ ] Log warm-up, working, back-off, AMRAP, drop and failure sets.
- [ ] Log RPE/RIR, set notes, exercise notes and a pain/discomfort note.
- [ ] Replace an exercise using suggested alternatives.
- [ ] Reorder and remove an exercise, then undo.
- [ ] Complete a superset round and confirm the rest timer waits until both partners have a completed set.
- [ ] Close/reopen the app and resume the unfinished workout.
- [ ] Finish the workout and confirm it appears once in history.

### Analytics/coaching

- [ ] Open progression for a logged exercise.
- [ ] Switch graph metrics.
- [ ] Confirm best/safe/stretch/avoid targets have a plain-English reason.
- [ ] Confirm same-muscle work earlier today changes live-fatigue context.
- [ ] View weekly/28-day muscle load, most improved and stale exercises.
- [ ] Add body/sleep and cardio logs and confirm readiness/cardio summaries update.
- [ ] Test bodyweight, assisted and unilateral exercises; confirm assistance progression moves downward and optional two-side volume behaves as labelled.

### Backup and offline

- [ ] Export v10 JSON.
- [ ] Import it into a separate browser profile and confirm counts/IDs.
- [ ] Turn off networking and log a workout.
- [ ] Refresh offline and confirm the app and active workout load.
- [ ] Reconnect and confirm the online indicator changes.

### Sync

- [ ] Replace and redeploy the included Apps Script as a **new deployment version**.
- [ ] Run diagnostics: backend must report v10.0.
- [ ] From the device with the latest data, push one full backup and wait for confirmation.
- [ ] With a deliberately enlarged test backup above the frontend threshold, confirm full push shows chunk progress, retries a missing chunk and commits exactly once.
- [ ] Pull on iPhone; confirm no duplicate sessions/sets/templates/exercises.
- [ ] Change one record on laptop and use incremental push.
- [ ] Pull on iPhone and confirm only the change merges.
- [ ] Change different records offline on each device; sync both and confirm both survive.
- [ ] Delete a test record on one device; sync and confirm the soft deletion propagates.
- [ ] Interrupt a chunked pull and confirm local data is unchanged.
- [ ] Use a wrong token and confirm failure does not wipe data.
- [ ] Confirm a pending/unconfirmed push is clearly reported in diagnostics.
- [ ] Confirm the manifest `requestId` matches the exact push before the local cursor advances.

## Browser-testing limitation

This package was syntax-checked and exercised in a JavaScript DOM/localStorage harness. A real Safari/iPhone and deployed Apps Script round trip still require the manual acceptance steps above because this build environment cannot reproduce the user’s GitHub Pages origin, Google account deployment or iOS PWA runtime.
