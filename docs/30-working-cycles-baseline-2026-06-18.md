# Baseline before "Working cycles and real-use UX" stage

Date: 2026-06-18

This file fixes the known-good state before starting the next large stage of work. Do not remove it during the stage: it is the rollback and comparison point for releases A, B, and C.

## Production state

- Production URL: `https://kontur.derevgroup.ru`
- Production commitHash: `53872e6`
- Local repository HEAD before new changes: `53872e6`
- App version: `20260618-media-slides`
- Environment: `production`
- Version endpoint: `https://kontur.derevgroup.ru/version`
- Public QA report: `https://kontur.derevgroup.ru/qa-artifacts/latest/qa-report.md`

## QA state

- Latest QA report commit:
  - `productionVersionCommitHash: 53872e6`
  - `qaRunCommitHash: 53872e6`
  - `snapshotCommitHash: 53872e6`
- Latest QA result: `PARTIAL`
- Accepted PARTIAL reason: `external_cookieless_viewer`
- Critical errors at baseline: none known.

The accepted rule remains: do not mark the work as `PASS` when a required unsupported external scenario is still `PARTIAL`. For external AI review use the read-only snapshot; for live audit use a normal browser with cookies/session.

## Production backup

Before starting new changes, a production backup was created through the existing deployment backup script:

- Database backup: `/backups/construction-20260618-161638.db`
- Uploads backup: `/backups/uploads-20260618-161638.zip`

The backup was created on the production server before any migrations for this stage.

## Recently completed behavior to preserve

The following behavior was working at baseline and must not be broken by the next stage:

- Uploaded photos open inside Kontur, not in an uncontrolled external screen.
- Photo preview has close/back control.
- Photo preview supports slideshow controls and swipe on mobile.
- PWA cache version for the photo preview release is active.
- Mobile navigation includes the expanded sections through the "More" flow.
- Audit read-only mode rejects mutating methods.
- QA report is publicly available through the app.

## Stage plan

Work must be split into separate production releases:

1. Release A: statuses, transitions, overdue rules, photo-report integrity, material stage/health, data integrity agent.
2. Release B: "My actions", notifications without noise, object switcher, global search.
3. Release C: contextual feedback, privacy-safe UX analytics, mobile upload reliability, component cleanup.

After each release:

- run the full quality gate;
- run production smoke;
- update snapshot and QA report;
- create a separate release note;
- send a structured MAX report if a valid MAX target is available.

## Safety rules for this stage

- Do not delete or rewrite user data.
- Database changes must be repeatable.
- Migrations must be additive by default.
- Any automatic data correction must be opt-in and auditable.
- New workflows should be feature-flagged where possible.
- Existing URLs and current working flows must remain compatible.
- Zero-element QA checks must not be reported as `OK` when the element is required.
