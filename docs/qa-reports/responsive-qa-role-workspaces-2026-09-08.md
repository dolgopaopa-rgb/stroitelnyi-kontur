# Responsive QA - role workspaces - 2026-09-08

## Scope

- Project: Stroitelnyi Kontur, staging UI only.
- Routes: /today and /estimates for sales_manager and estimator; /materials and /tasks for estimator.
- States: comfortable/compact density; collapsed/expanded decisions; all seven estimate filters; active/archive material lists; material quick-filter selection; empty estimator checks.
- Regression: owner /today, /tasks and /locations from the preceding layout release.
- Source: codex/staging-role-workspaces-20260908, based on 809bd3b.
- Audit mode: regression and staged release recheck.
- No production/main changes, database migrations, API changes or MAX delivery.

## Environment

- Chrome 152.0.7977.76, Playwright 1.60.0, Windows headless rendering.
- Local Python server on 127.0.0.1:8897, isolated APP_DATA_DIR with synthetic records. Estimate fixtures and manager assignments are browser-only mocks.
- Separate full QA server on 127.0.0.1:8898, its own synthetic database, local storage and empty MAX token. External QA URL is redirected to localhost.
- Preview also tested against actual staging data by substituting only local static assets in the browser. All writes except normal login blocked; no external requests allowed.
- Emulation, not physical devices. macOS Safari, real iOS/Android keyboards and actual TV controls were not tested.
- Continuous sweep: 320-1920 CSS px in 16 px steps, relevant breakpoints +/-1, plus 2560, 3440, 3840.
- Text stress: 200% computed text at 640x480; 320 px reflow; short 568 px viewport. Existing long real staging titles also inspected.

## Matrix

Each row covers both densities and both applicable roles. Full numeric evidence: [matrix.json](evidence-role-workspaces-2026-09-08/matrix.json).

| Class | CSS viewport | State | Overflow delta | Result |
|---|---:|---|---:|---|
| Narrow phone | 320x568 | portrait | 0 | PASS |
| Small phone | 360x640 | portrait | 0 | PASS |
| Phone | 375x667 | portrait | 0 | PASS |
| Phone | 390x844 | touch emulation | 0 | PASS |
| Large phone | 430x932 | portrait | 0 | PASS |
| Foldable | 720x840 | unfolded | 0 | PASS |
| Foldable | 832x750 | unfolded | 0 | PASS |
| Tablet | 768x1024 | portrait | 0 | PASS |
| Tablet | 1024x768 | landscape | 0 | PASS |
| Laptop | 1280x720 | landscape | 0 | PASS |
| Desktop | 1440x900 | landscape | 0 | PASS |
| Full HD | 1920x1080 | landscape | 0 | PASS |
| 4K | 3840x2160 | landscape | 0 | PASS |

156 fixed role/density/route cases; 12 continuous sweeps; no command text outside its button/summary. Wide screenshot evidence is synthetic:

- [Manager Today](evidence-role-workspaces-2026-09-08/sales_manager-today-1440.png)
- [Estimator Today](evidence-role-workspaces-2026-09-08/estimator-today-1440.png)
- [Estimates](evidence-role-workspaces-2026-09-08/estimator-estimates-1440.png)
- [Materials](evidence-role-workspaces-2026-09-08/estimator-materials-1440.png)
- [Narrow materials](evidence-role-workspaces-2026-09-08/estimator-materials-320.png)

## Container alignment

| Width | Region | Left/right widths | Height delta | Result |
|---:|---|---:|---:|---|
| 1440 | Staging material panels, both densities | 567 / 567 | 0 | PASS |
| 1440 | Staging material headers, both densities | 537 / 537 | 0 | PASS |
| 1180-1920 | Side-by-side material panels | equal within 1 px | <=1 px | PASS |
| <=1100 | Materials | full-width stacked panels | content-driven | PASS |
| 1440, 1920 | Manager object cards | equal tracks | <=1 px | PASS |

Material headers are 93 px high in both panels at 1440. First request starts after a separate 14 px list margin and 14 px top padding. Object status text remains one line; actions are below metrics.

## Findings

### RQA-001 - major - Manager object status squeezed by actions

- Cause: each of three cards inherited a two-column inner grid, with actions consuming the title/status column.
- Fix: explicit single-column card areas, non-shrinking status, separate action row, consistent corners and responsive title wrapping.
- Recheck: six widths, both densities; status height no greater than one line; wide cards equal height; expand action opens details.

### RQA-002 - major - Estimate counters were non-interactive

- Cause: counters rendered as divs and all jobs were always displayed.
- Fix: semantic filter buttons with aria-pressed and preserved focus; matching timeline/list subset; all counters remain based on the full visible job set.
- Active jobs are blue; overdue takes red precedence and has explicit deadline text. Completed estimates with past deadlines are not overdue.
- Recheck: all seven filters, exact row IDs/counts, keyboard Enter/focus, three distinct backgrounds; actual staging overdue filter returns exactly five matching jobs.

### RQA-003 - major - Tall Today decision list

- Fix: two initial decisions for manager/estimator, inline disclosure for all remaining items; independent per-role disclosure keys. Manager list no longer clips the second item behind an arbitrary scrolling height.
- Recheck: expand/collapse by keyboard and pointer; previous owner expansion state regression remains covered.

### RQA-004 - moderate - Materials hierarchy and uneven headers

- Fix: equal columns, identical two-row header structure, separated stage tabs and a single select for additional filters, spacing before request list.
- Recheck: widths/heights/header alignment, active/archive reset, quick-filter change, race-condition regression.
- Estimator task headings and empty state now use checks terminology. Task access rules and lifecycle are unchanged.

### RQA-005 - QA tooling drift

- Existing full-suite role setup attempted to select a deliberately hidden mobile role control. The helper now temporarily uses a desktop viewport for role selection and restores the original viewport before continuing mobile tests.
- Visual QA expected the obsolete /?view=estimates URL although the application canonicalizes it to /estimates. Updated the expected route.
- No error suppression or skipped application assertions added.

## Recheck

- Targeted Playwright: 29 passed, 0 failed, 0 flaky, 3 intentional skips for duplicate desktop sweeps in the mobile project. [Summary](evidence-role-workspaces-2026-09-08/test-summary.json).
- Preview against actual staging: 72 role/density/route/width cases, 0 page/console errors, 0 data writes, 0 external requests.
- Full QA rerun: lint, JS syntax, unit smoke, scroll, buttons, navigation, mobile, workflow, photo-report integrity, data integrity, D2DOM control and console checks OK; no critical errors. All role checks OK.
- Full QA aggregate is PARTIAL only because an external viewer without cookie support cannot retain audit authentication. Audit login, write-method rejection, hidden write controls and sensitive-data checks passed. This is not reported as a global PASS.
- Full suite used the documented direct Node fallback instead of npm; isolated local data only.
- Final publication verification must re-read /version, compare served CSS/JS/SW to these files, repeat 72 live geometry checks and verify the versioned service-worker cache. Local evidence destination: .tmp/live-roles-after/.
- No live screenshots or credentials are included in committed evidence.

## Verdict

READY for scoped staging publication. Full QA aggregate: PARTIAL (cookie-limited external viewer).

The scoped responsive and interaction checks pass, with no critical errors in the complete suite. This does not certify unsupported cookie-less viewers or untested physical devices. Rollback revision: 809bd3b. Production remains unchanged.
