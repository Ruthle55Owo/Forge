# Migration notes — schema 9 to schema 10

## Safety guarantees

- The storage key remains **`forge_fitness_tracker_v5`**.
- Existing exercise, template, session and set IDs are preserved.
- Existing fields are retained for backward compatibility.
- The first v10 migration writes a safety copy to a separate localStorage key before saving the migrated database.
- Import creates another safety copy before merge.
- Migration, import and pull use merge-by-ID; a failed operation never clears local data.
- The active workout remains local during cloud pull/merge.

## Added fields

### All syncable records

- `createdAt`
- `updatedAt`
- `deletedAt`
- `deviceId`

Missing timestamps are inferred conservatively from existing session dates/start/end times or the migration time.

### Exercise

- `aliases: string[]`
- `primaryMuscles: string[]`
- `secondaryMuscles: string[]`
- `favorite: boolean`
- `archived: boolean`
- `doNotRecommend: boolean`
- `builtIn: boolean`
- `loadMode`
- `unilateral: boolean`
- `countBothSides: boolean`

The legacy `muscle` field remains intact.

### Template

- `category`
- `timeCap`
- `pinned`
- Stable ID for each template exercise row
- `targetRpe`
- `targetRir`
- Row `notes`
- Row `order`

### Session / exercise / set

- Stable ID for session exercise rows
- Session `timeCap`
- Exercise `notes` and `painNote`
- Set `rir` and `notes`
- Additional set types: warm-up, working, back-off, AMRAP, drop and failure

## Deletion behavior

User records are soft-deleted by assigning `deletedAt`. They stay in the database long enough to sync the deletion safely. A future maintenance tool may permanently purge old tombstones after every device has synchronized.

## Conflict rule

1. Match by stable ID.
2. Prefer the record with the later `deletedAt`, `updatedAt` or `createdAt` timestamp.
3. If timestamps tie, keep the more complete record.
4. For tied session-exercise structures, set arrays are deduplicated by set ID.
5. Never delete a local record merely because it is absent from a remote payload.

## First v10 sync baseline

After upgrading a v9 local database, Forge marks sync as needing one confirmed full baseline. This prevents historical sessions whose inferred timestamps predate the old sync cursor from being skipped. Push a merge-safe full backup from the device with the newest data, or pull from a cloud backup already written by v10. Routine sync becomes incremental after that confirmation.

## Backup compatibility

- v9 backups can be imported directly; they migrate in memory before merge.
- v10 exports contain the added metadata.
- The full-backup cloud path remains available alongside incremental sync. Large full pushes use a temporary chunk store and commit only after all chunks arrive.
- The cloud manifest records the exact `requestId`; the browser does not advance its sync cursor without matching acknowledgement.
