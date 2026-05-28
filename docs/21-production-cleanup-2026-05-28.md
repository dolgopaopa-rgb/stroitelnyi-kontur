# Production Cleanup 2026-05-28

## Request

Clear current projects, materials, and works from the production app so the next test can start from a clean slate. Keep the knowledge base untouched.

## Safety Step

Before deleting data, a SQLite backup was created on the production server:

`/data/construction-backup-before-clean-20260528-174642.db`

The backup remains inside the app data volume on the server.

## Code Guard

Added a guard to `seed_estimate_materials()` so old sample estimate materials do not reappear after the working data is cleared and the app restarts.

Commit: `07dfa04 Guard sample material seeding`

## Removed Production Data

- Regular projects: 7
- Customers: 6
- Tasks: 8
- Task history rows: 5
- Material request batches: 3
- Material request rows: 22
- Estimate materials: 415
- Work items: 482
- Extra work items: 0
- Variations / extra work records: 2
- Project documents: 41
- Events: 71
- Notifications: 144

## Preserved Production Data

- Knowledge base service project: 1
- Knowledge base documents: 2
- Users: 11
- Feedback items from MAX: 9
- Supplier locations: 0

## Verification

After cleanup:

- Regular projects: 0
- Customers: 0
- Tasks: 0
- Material requests: 0
- Estimate materials: 0
- Work items: 0
- Extra work items: 0
- Variations: 0
- Project documents outside knowledge base: 0
- Notifications: 0
- Knowledge base documents: 2

The production app container is healthy. A GET request to `https://kontur.derevgroup.ru` returns `401`, which is expected because the app is protected by authorization.
