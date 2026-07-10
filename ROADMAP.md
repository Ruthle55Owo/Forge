# Recommended roadmap

## Current v10 — safe evolution of the working base

- Keep local-first operation.
- Keep Google Sheets full backup as the disaster-recovery path.
- Use record-level delta sync for routine changes.
- Keep migration and conflict handling conservative.

## v10.x — modularise and harden

- Split the single-file app into modules: storage, domain model, search, training engine, analytics, UI and sync.
- Add Playwright browser tests and deterministic migration fixtures.
- Add an in-app conflict viewer for true simultaneous edits to the same record.
- Add tombstone retention/purge rules after all known devices acknowledge a sync generation.
- Add a proper workout calendar and scheduled notifications.
- Add richer exercise substitutions using movement pattern, equipment and pain exclusions.
- Complete true kg/lb display-and-entry conversion while retaining canonical stored units.
- Avoid O(database) snapshot/table rebuilds on every delta by updating only affected backend rows.

## v11 — IndexedDB

Move user data from localStorage to IndexedDB while keeping a compatibility reader for the existing storage key. Benefits:

- Transactional writes.
- Faster access to years of sessions.
- Record-level queries without serialising the whole database.
- Larger safe storage capacity.
- Better basis for a durable sync queue.

## Future cloud — record database

For multi-device scale, move from spreadsheet snapshots to Supabase/Postgres or another record database:

- One row per record with stable ID, user ID, device ID, `updatedAt`, `deletedAt` and revision.
- Server-acknowledged cursor per device.
- Row-level security and authenticated users.
- Conflict log rather than silent overwrites.
- Keep encrypted/manual JSON export as an independent escape hatch.

Google Sheets can remain a readable reporting mirror even after it is no longer the primary sync database.
