# Rada Independent Deep QA - 2026-09-10

**NOT READY** for a complete audit certificate: coverage is **PARTIAL / INCOMPLETE AUDIT**. All confirmed targeted blockers below were fixed and independently rechecked; authorization regression passed 6/6. The coordinator explicitly stopped further browser work during the final sweep to reduce concurrent Windows browser load. This is not a production certification.

## Scope

- Shared worktree: `kontur-audit-20260910`, branch `codex/production-audit-20260910`, base `23dafdd`.
- Rada did not edit application code, permissions, schema, secrets, deployment, or production data. Other agents' modifications were not reverted.
- Read: repository `AGENTS.md`, `CODEX_RULES.md`, D2DOM-OS entry documents, Rada skill and device/report references. The targeted authorization validation skill was used after explicit validation approval.
- Routes: `/today`, `/assistant`, `/objects`, `/estimates`, `/tasks`, `/works`, `/materials`, `/variations`, `/photo-reports`, `/object-issues`, `/locations`, `/documents`, `/signals`, `/feedback`, `/settings`.
- Owner navigation: all 15 routes via desktop and the actual mobile More menu. Local roles: owner, construction_manager, sales_manager, procurement_manager, estimator, foreman, technical_supervisor, finance_director, accountant, master, ai_auditor.
- Additional states: 8 object detail tabs, 10 create forms, task details, 26-card task list, two-photo preview, knowledge-base upload/download, read-only UI, native dialog keyboard traversal.
- No overall QA orchestrator, commit, deploy, MAX/Telegram delivery, or production request was performed by Rada.

## Environment

- Windows, headless Chrome `152.0.7977.83`, Playwright. These are CSS viewport emulations, not physical Mac/iOS or model certification.
- Local server `127.0.0.1:8901`; `APP_DATA_DIR=.tmp/rada/data`, `STORAGE_PROVIDER=local`, empty `MAX_TOKEN`, localhost public/external base. External browser requests were blocked.
- Local defaults were seeded by the app into a new database; Rada added only synthetic tasks, one synthetic master, generated PNGs and disposable files/variations. No real database was copied.
- Permanent authorization tests use a separate subprocess on `127.0.0.1:8902`, a new `.tmp/rada-auth-regression-*` directory, real cookie login and no role switching. Their server is stopped and data removed by test cleanup.
- Initial sweep: 320-1920 CSS px at 16px steps, all relevant sampled breakpoints at -1/0/+1, plus 2560/3440/3840. 132 widths across 9 principal views = 1188 measurements. Initial data: `.tmp/rada/evidence/audit.json`.
- Fresh bundled pass completed real-session identity verification for all 11 roles, 101 permitted desktop route transitions, all 18 matrix captures, and 612 final sweep samples (153 widths each for Today, Objects, Tasks, Materials). No JS or HTTP errors in that saved portion. Other five final sweep views were stopped before completion and must not be called PASS. `audit-refresh.json` has no `ended` field because it was interrupted; use only its saved completed records.
- Initial master/auditor runs used account user_id=0 and were invalid for role conclusions. They were discarded and repeated with real synthetic users 14/12. The invalid 403 at data-integrity is not an application finding.
- Read-only UI fix was independently checked by intercepting local `/static/app.compat.js` with current `app.js`, SHA256 `84670c45427ea01423bb891615078750acbb390a4bdbf0c7a62a1d347a174c18`. This does not validate the unbuilt compatibility bundle.
- A later, completed no-interception check verified the actual served compatibility bundle for ai_auditor12 at1440x900/390x844: 8 routes each plus two denied backend writes. `readonly-bundled.json`, 18 checks, no errors. Bundle SHA256 `70928cc97f0bbcbf4ac5df393a43525ea47fc98512ef19b025318ec68e089827`.
- Closeout filesystem hashes match all six hashes recorded at final-pass start. Server remained `9125a784276a795bfb8b2a11939abba5288baa47d6065cb2afd68ea7af8e6aba`; app.js `ee57389a32c834b25a59b7fa93f703f11b96179ca4d0b1bf8fa5812cf90aea2d`; crm-theme.css `11505d1082dea6566f696ffdf64cf97f7800d1640ad7ed79decb49c4c7cc7bde`. Hash stability does not turn interrupted checks into completed checks.
- Limitations: no physical devices, OS keyboard/safe-area certification, actual browser 400% zoom or 200% system text scaling, segmented hinges, production TLS/storage integrations, or exhaustive conditional business workflows. Allbuttons does not mean every destructive operation was executed.

## Matrix

Core captures were refreshed on the served bundle, with fresh navigation and local network-idle wait; forms cover the listed subset. Screenshot filenames below are under `.tmp/rada/evidence/`. The matrix is evidence of those states, not complete-device certification.

| Class | CSS viewport | State | Evidence | Document overflow | Result |
|---|---|---|---|---:|---|
| Narrow phone | 320x568 | Today; forms | owner-today-320x568.png | 0 | Rendered; card-width observation below |
| Small phone | 360x640 | Today | owner-today-360x640.png | 0 | Rendered |
| Phone | 375x667 | Today | owner-today-375x667.png | 0 | Rendered |
| Phone | 375x812 | Today; forms; media | owner-today-375x812.png; media-375.png | 0 | Rendered; media cycle passed |
| Phone | 390x844 | Routes; forms; media | owner-today-390x844.png; media-390.png | 0 | Functional checks below |
| Large phone | 430x932 | Today; forms; media | owner-today-430x932.png; media-430.png | 0 | Media cycle passed |
| Foldable | 720x840 | Today; resize | owner-today-720x840.png | 0 | Emulated |
| Foldable | 832x750 | Today; resize | owner-today-832x750.png | 0 | Emulated |
| Tablet | 768x1024 | Today; forms; media | owner-today-768x1024.png; media-768.png | 0 | Media cycle passed |
| Tablet landscape | 1024x768 | Today | owner-today-1024x768.png | 0 | Emulated |
| Laptop | 1280x720 | Today | owner-today-1280x720.png | 0 | Rendered |
| Desktop | 1440x900 | All permitted role routes | owner-today-1440x900.png | 0 | Navigation exercised |
| Full HD | 1920x1080 | Today | owner-today-1920x1080.png | 0 | Rendered |
| 4K | 3840x2160 | Today | owner-today-3840x2160.png | 0 | CSS viewport, not TV hardware |
| Ultrawide | 2560x1440; 3440x1440 | Today | owner-today-2560x1440.png; owner-today-3440x1440.png | 0 | Rendered |
| Low height | 832x400 | Ten open forms | *Dialog-832x400.png | 0 inner overflow | Close/cancel accessible after scroll |
| Landscape | 840x720; 1024x600 | Today | corresponding owner-today screenshots | 0 | Resize without assuming physical orientation |

## Container alignment

| Width | Header left/right | Main left/right | Delta | Result |
|---:|---:|---:|---:|---|
| 1280 | 210 / 1280 | 234 / 1256 | 24px inner inset each side | Consistent container padding |
| 1440 | 244 / 1440 | 268 / 1416 | 24px inner inset each side | Consistent container padding |

The audit measures negative x and click reachability, not only `document.scrollWidth`. Internally scrollable estimate-stat strips are distinguished from page overflow.

## Findings

### RADA-AUTH-01 - High / Release Blocker, Resolved Locally - Body role overrides session for variation approval

- Validated by real HTTP login: session.role=user.role=estimator, user_id=5, can_switch_role=false.
- Created new synthetic variation id 3. `POST /api/variations/3/approve` with actor_role=estimator returned 400; independent owner GET remained decision_required / not_decided. With actor_role=owner, same real session and actor_id=5, returned 200; independent GET confirmed approved / company.
- Existing intended allowlist, present in UI and handler: owner, construction_manager, finance_director. User-facing error text omits finance_director but the code allowlist includes it.
- Root cause: the handler prefers `data.actor_role` to `account_role(account)`. The authenticated session is not the deciding authority for this operation. `reject` shares this guard; its original exploit was not separately executed.
- Evidence: `.tmp/rada/evidence/auth-validation.json`, `.tmp/rada-auth.mjs`. Current server at reproduction: SHA256 `18ee1bbed6845fc1e9f8eb39c4824bdbcbdf96ba55726c27d4643ff6d3082644`.
- Validation rubric: real interface, real restricted identity, own fixture, native negative control, independent persisted-state confirmation all satisfied. High confidence. No production exploitation or evidence of historical abuse is claimed.
- Correction ownership: Anna, narrowly enforce existing allowlist using authenticated role, including reject sibling. Rada does not change policy or application code.
- Regression: `tests/test_actor_authorization.py`, negative native/forged variants plus positive existing-director allowlist. Post-fix 6/6 passed at 18:03:24-18:03:25 UTC; server SHA256 before=after=`9125a784276a795bfb8b2a11939abba5288baa47d6065cb2afd68ea7af8e6aba`. Evidence `auth-regression.json`. This blocker is resolved on that snapshot only.

### RADA-AUTH-02 - High / Release Blocker, Resolved Locally - Body role allows unauthorized knowledge-file deletion

- Same real estimator session, no switching. Fresh synthetic knowledge document id 8, created by owner.
- `POST /api/documents/8/delete` with actor_role=estimator returned 400; download remained 200. Changing claimed role to owner returned 200/deleted=8; independent owner download returned 404.
- Existing intended allowlist: owner, construction_manager. UI `canDeleteKnowledgeBase()` matches this list. Finance director is not an allowed deleter.
- Root cause: the handler checks untrusted body actor_role instead of authenticated account role before `delete_stored_file` and document-row deletion.
- Evidence and validation method: same local JSON and PoC as AUTH-01. Separate fresh fixture, negative control and independent disappearance check; high confidence, reportable.
- Post-fix regression confirms denied requests leave exact file bytes intact and both legitimate director roles can delete their synthetic fixture. Included in the same 6/6 run. Ordinary estimator review ignores forged actor_id=1 and records author5; authorized role-switch owner preserves selected role restrictions, selected-author2 and fallback-author1. This blocker is resolved on the signed snapshot above, without expanding allowlists.

### RQA-001 - Major, Resolved Locally - Object active/archive controls disappear left

- `/objects`, owner, fresh 768x900 and sweep 721px upward. `[data-project-list="active"]` and `[data-project-list="archive"]` were at negative x while page overflow remained 0. At 768px the active control began approximately x=-702. The separate display-mode controls remained visible.
- Evidence: `probe-objects-768.png`, initial audit projects sweep. Cause: two 100%-width segmented groups inside a nowrap/end-justified toolbar.
- Zina fixed the existing toolbar layout. Independent regression passed all four controls' bounds and Playwright click-trial on 320/390/720/721/768/820/832/1024/1100/1101/1440, plus actual Archive -> Active switching.
- Permanent test: `tests/e2e/deep-audit-navigation.spec.ts`; `.tmp/rada/evidence/regression-results.json`: 2/2 passed including complete mobile-menu navigation. Additional current-CSS objects sweep passed 108 widths; later bundled Objects sweep completed all153 sampled widths. No negative-x/outside controls or page overflow. Evidence `css-refresh.json`, `audit-refresh.json`.

### RQA-002 - Major UX, Resolved Locally - Auditor sees actions that cannot be saved

- Correct synthetic ai_auditor12 saw active task/variation/remark/photo/event/material create controls, upload and mobile quick action, despite backend writes correctly returning 403.
- Maria added UI gating; independent SOURCE-ONLY refresh on 1440x900/390x844 across 8 routes found all seven mutation controls hidden+disabled, upload hidden, object selector enabled, no JS errors. Backend POST /api/tasks stayed 403.
- Later completed bundle verification reproduced the same passing result without source interception: `readonly-bundled.json`, `readonly-bundled-tasks-*.png`, `readonly-bundled-materials-*.png`. This is targeted read-only verification, not final complete mobile QA.

### RQA-003 - Visible Technical Enums, Resolved Locally - Object history

- `/objects?project=1`, History tab, 390x844: synthetic events display raw `photo_report`, `variation`, `document` text.
- Evidence: `object-tab-events-390.png`, `.tmp/rada/evidence/extra-refresh.json`, object-tabs/events.
- Existing repository rules classify visible technical enums as a blocker. Maria fixed the display labels. Completed bundled recheck shows human-readable Russian labels for photo report/document/variation in the same history tab; `extra-refresh.json` and refreshed `object-tab-events-390.png`.

### RQA-004 - Minor, Resolved Locally - More menu does not close with Escape

- `#mobileQuickSheet`, 390x844: More -> Tab focuses close button; Escape leaves menu open. Close button and all 15 route selections work.
- Initial failure was confirmed; after Maria's fix, completed bundled `extra-refresh.json` / keyboard-sheet records `escapeClosed=true`. Explicit close and all route selections also work. Physical keyboard/OS accessibility certification and a separate focus-restoration assertion for this sheet are not claimed.

### Observations

- At 320px initial Today nested object cards measured 270px versus project guideline min(300, viewport-40)=280px. At standard 360/375/390/430 phone widths no narrow-card flag. No letter-stacking was observed.
- Estimate stat buttons live in an intentional horizontal `overflow:auto` strip (clientWidth 270, scrollWidth 758 at 320px). Last filter is clickable and becomes active, but rerender returns the strip to its initial position. This is not document overflow; retained filter visibility merits follow-up.
- Native dialog Tab traversal returned one BODY focus sample at the browser boundary and then re-entered the dialog. No background application control was focused; this is not reported as a focus-trap vulnerability. Escape restored focus to `#newTaskButton`.

## Recheck

- Ten forms: project, task, photo report, object remark, estimate job, material request, knowledge folder, document, variation, event. Seven viewport states each; no dialog horizontal overflow; empty submit stays open; Escape and explicit close pass. Evidence `flows-refresh.json`. This does not claim successful submission of every business form.
- Task scroll: mouse wheel moved 600px; 26 visible cards; final card bottom 729.36 vs fixed mobile navigation top 775 at 390x844. Task detail open/close preserves scroll 3412 -> 3412. Evidence `last-card-viewport.png`, `extra-refresh.json`.
- Object details: all 8 tabs were clicked and captured. Empty remarks/material-specific conditional workflows are not fully exercised.
- CSV: UI upload returned 201, correct download endpoint returned 200, Content-Type text/csv, UTF-8 filename with Cyrillic/spaces, exact original bytes. Browser download completed without failure. Evidence `flows-refresh.json`, `extra-refresh.json`, `downloaded-csv.csv`.
- Two generated 640x480 PNGs: UI upload, image/png 200, thumbnail width159px at390, in-app 1/2 -> 2/2 -> 1/2, explicit close returns to same app screen. Repeated at375/390/430/768. Evidence media-*.png and JSON above.
- Local initial probe errors caused by non-unique/hidden selectors and an incorrect handcrafted `/file` URL were corrected. They are not application findings; `flows-refresh.json` and `extra-refresh.json` supersede those probe errors.
- Independent Zina CSS recheck: expanded estimate main/actions stack at832 (757px main) and1024 (949px main); at1101 actions are280px beside502px main, at1440 actions280px beside807px main. Photo thumbnails minimum122.65px at832 and131.70px at1024. Evidence `css-refresh.json`, expanded-estimate-*.png, photo-report-layout-*.png. Desktop >1100 thumbnails were96-103px; mobile120px criterion is not asserted there.
- No full production readiness claim: shared orchestrator and final compiled Mobile certification remain coordinator-owned. The completed bundle-specific evidence above must not be expanded to cover stopped or unexecuted checks.

## Stop and Cleanup

- The coordinator reported one `ERR_NO_BUFFER_SPACE` during its separate local run and requested all Rada browsers and own8901 to stop. This error was not reproduced by Rada; its cause is not established by this audit.
- Rada stopped its final audit session, which had saved four complete final sweep views. The extra interaction run had already completed and closed its browser. All task-created browser contexts were closed either by normal finally cleanup or Playwright process shutdown.
- Own8901 server was stopped. No listeners remained on8901 or8902. Process inspection found no Rada node runner; remaining Chrome roots belonged to other Playwright workers and were not touched.
- No further browser run or global QA was started after the stop instruction. Only saved-evidence review, report editing, structural report validation and read-only filesystem/process checks followed.

## Changed Files

- `qa-reports/production-audit-20260910-rada.md` - this report.
- `tests/e2e/deep-audit-navigation.spec.ts` - object-toolbar bounds/clickability and all available mobile-menu destinations.
- `tests/test_actor_authorization.py` - separately authorized permanent real-session regression; not duplicated as E2E.
- `.tmp/rada*` - isolated server, synthetic fixtures, local probes, screenshots, JSON evidence and downloaded fixture.
- All app/server/style/bundle changes belong to other agents. Rada has not committed or deployed anything.

## Verdict

**NOT READY** as a complete independent release certificate; reason: **INCOMPLETE AUDIT**, not an outstanding confirmed targeted blocker. Targeted status is **PASS** for auth6, toolbar/mobile-navigation2, compiled read-only gating, the checked media loop, corrected event labels and Escape. Full final sweep, physical devices, actual zoom/text scaling and complete conditional-state coverage were not completed.

Next action: coordinator reviews the three Rada deliverables and performs the final compiled Mobile/global quality gate from its own run. Rada starts no additional browser work without a new instruction. Repeat the same six auth tests only if the tested helper/handlers change; recorded server hash remained stable at closeout.
