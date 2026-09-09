# Production UI promotion - 2026-09-09

## Scope

Owner explicitly authorized replacing the working Contour version with the reviewed staging version.
The release merges staging UI 709dfd2 into the actually deployed production revision 9ab3dbb.
Unpublished origin/main 2255018 (appeals) is not included.

Production Python, schema, API, access rules, dependencies, Dockerfile and production compose remain identical to 9ab3dbb.
Production data is not replaced by staging data. Staging stays separate.
Archive, partial material acceptance, estimate replacement and manager notifications are preserved.

## Verification Before Publication

- Full local QA and QA-fix orchestrator ran against separate synthetic SQLite databases with MAX disabled and local storage.
- Lint, typecheck, unit, workflow, data integrity, photo integrity, navigation, buttons, scroll, roles, mobile and console checks succeeded.
- Overall full-gate result is PARTIAL only for the external cookieless audit viewer. Cookie-authenticated checks succeeded; no critical errors.
- 29 focused workspace tests passed across final reruns; 3 duplicate mobile matrix tests intentionally skipped.
- 14 offline production-preservation tests passed on desktop and mobile; every API request is explicitly mocked.
- Responsive matrix: 320x568, 360x640, 375x667, 390x844, 430x932, 720x840, 832x750, 768x1024, 1024x768, 1280x720, 1440x900, 1920x1080, 3840x2160.
- Continuous sweep, breakpoint checks and 200 percent text stress passed. Windows Chrome emulation, not physical Mac/iPhone/TV certification.
- Read-only browser preview on actual production data: 72 checks, no browser errors, no attempted data writes, no external requests.
- New cache version: 20260909-production-crm.

## Backup And Rollback

Before publication, SQLite online backup and local uploads archive were created in the server production backup directory production-ui-20260909.
Backup integrity_check returned ok. Working database and staging database are not exchanged.
Previous image and production access/integration settings are retained for code-only rollback.
Deployment targets only the existing production app service, preserving the data volume and reverse proxy.

## Evidence

Local untracked .tmp evidence contains the focused test results, synthetic screenshots and production browser checks.
Screenshots with real production data and configuration snapshots must not be committed.
After-deployment version, data/config comparison, browser checks and existing-PWA cache upgrade are verified separately during publication.
