# QA report

- Дата: 2026-07-02T07:20:33.559Z
- Версия/commit: 20260623-d2dom-control-v1 / 309f64c
- environment: local
- targetEnvironment: local QA server via localhost
- externalBaseUrl: https://kontur.derevgroup.ru
- localTestUrl: http://127.0.0.1:8765
- productionVersionCommitHash: 309f64c
- qaRunCommitHash: 309f64c
- snapshotCommitHash: 309f64c
- URL: http://127.0.0.1:8765
- Итог: **PARTIAL**

## QA-агенты

- QA Orchestrator Agent
- Scroll QA Agent
- Button QA Agent
- Navigation QA Agent
- Role QA Agent
- Read-only Safety QA Agent
- UX Sanity QA Agent
- Workflow QA Agent
- Photo Report Integrity QA Agent
- Data Integrity Agent
- Mobile QA Agent
- Console Error QA Agent
- Visual Regression QA Agent
- Visual Density QA Agent
- D2Dom Control Prototype QA Agent
- MAX Report Format QA Agent

## Результаты

- **OK** QA Orchestrator Agent: Lint. {
  "overall": "PASS",
  "checks": [
    {
      "name": "Python syntax",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax app/static/app.js",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax app/static/app.compat.js",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax src/notifications/max/formatMaxReport.mjs",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax tools/qa/run-quality-gate.mjs",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax tools/qa/max-report-cli.mjs",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax tools/qa/qa-fix-orchestrator.mjs",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax tools/qa/visual-snapshots.mjs",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "JS syntax scripts/generate-qa-report.js",
      "status": "OK",
      "details": "ok"
    },
    {
      "name": "Foreman/master can open extra work attachments",
      "status": "OK",
      "details": "variation_attachment and extra_work_attachment are allowed in server and frontend rules"
    },
    {
      "name": "Field roles can open photo report media",
      "status": "OK",
      "details": "photo_report and object_remark_photo are allowed for field roles in server and frontend rules"
    }
  ]
}
- **OK** QA Orchestrator Agent: Typecheck. JS syntax is valid.
- **OK** QA Orchestrator Agent: Unit smoke. db ok
- **OK** UX Sanity QA Agent: Mobile file download behavior. PDF/images open inside the app preview dialog with close controls; Excel and other office files download instead of opening blank mobile webview.
- **OK** UX Sanity QA Agent: Photo upload loading and compression. Photo reports prepare large images and show loading before API request starts.
- **OK** UX Sanity QA Agent: Work extras can use work-task rates. Extra works form exposes Smetter work-task rate selection, unit price and calculated total.
- **OK** UX Sanity QA Agent: Delivered material requests do not stay overdue. Delivered/closed non-problem material batches are excluded from attention risk scoring.
- **OK** UX Sanity QA Agent: Procurement can postpone or cancel material delivery without losing prices. Material request dialog exposes postpone/cancel delivery actions and both actions preserve actual purchase prices through the backend.
- **OK** UX Sanity QA Agent: Foreman can request postponed material delivery again. Postponed material batches return to the foreman; the foreman can send a new delivery date and comment back to procurement.
- **OK** QA Orchestrator Agent: Local QA fixtures. fixture ok project=14
- **OK** QA Orchestrator Agent: No white screen. Visible text length: 3912
- **OK** QA Orchestrator Agent: No endless loader. Loader nodes: 0
- **OK** QA Orchestrator Agent: Version endpoint is uncached and current. first=200; second=200; head=200; cache=no-store, no-cache, must-revalidate, max-age=0 / no-store, no-cache, must-revalidate, max-age=0 / no-store, no-cache, must-revalidate, max-age=0; headPragma=no-cache; headExpires=0; versionCommit=309f64cdb4f4; expectedCommit=309f64c
- **OK** Scroll QA Agent: Wheel scroll: today. scrollable=true; moved=true
- **OK** Scroll QA Agent: Wheel scroll: projects. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: tasks. scrollable=true; moved=true
- **OK** Scroll QA Agent: Wheel scroll: materials. scrollable=true; moved=true
- **OK** Scroll QA Agent: Wheel scroll: photos. scrollable=true; moved=true
- **OK** Scroll QA Agent: Wheel scroll: object_remarks. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: documents. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: dashboard. scrollable=true; moved=true
- **OK** Scroll QA Agent: Wheel scroll: feedback. scrollable=true; moved=true
- **OK** Scroll QA Agent: Scroll not locked after checks. overflow locked=false
- **OK** Button QA Agent: Open objects. before=Сегодня; after=Объекты
- **OK** Button QA Agent: Open tasks. before=Объекты; after=Задачи
- **OK** Button QA Agent: Open materials. before=Задачи; after=Материалы
- **OK** Button QA Agent: Open documents. before=Материалы; after=База знаний
- **OK** Button QA Agent: Open feedback. before=База знаний; after=Обратная связь по программе
- **OK** Button QA Agent: Feedback MAX messages and text are visible. rows=4; visibleTextRows=4; stats=Все 4 Новые 4 В работе 0 Обработано 0; status=Сообщений: 4. Последнее обновление: 10:19:04
- **OK** Button QA Agent: Open object card. object_cards=2; opened=true
- **OK** Button QA Agent: Object tabs switch. tabs=8; clicked=Задачи; active=Задачи
- **OK** Button QA Agent: Open task details. task_cards=141; beforeOpen=false; afterOpen=true
- **OK** Button QA Agent: Master next task action is available for actionable tasks. master_task_cards=141; actionable=141; next_action_buttons=5
- **OK** Button QA Agent: Material pipeline tabs switch. pipeline_buttons=8; switched=true
- **OK** Button QA Agent: Mobile + opens actions. actions=5; labels=Добавить фотоотчёт | Создать задачу | Создать замечание | Запросить материал | Сообщить проблему
- **OK** Button QA Agent: Master mobile quick actions. labels=Добавить фото | Сообщить проблему
- **OK** Navigation QA Agent: Route /today. url=http://127.0.0.1:8765/today; text=2150
- **OK** Navigation QA Agent: Route /objects. url=http://127.0.0.1:8765/objects; text=2138
- **OK** Navigation QA Agent: Route /tasks. url=http://127.0.0.1:8765/tasks; text=18371
- **OK** Navigation QA Agent: Route /materials. url=http://127.0.0.1:8765/materials; text=2138
- **OK** Navigation QA Agent: Route /photo-reports. url=http://127.0.0.1:8765/photo-reports; text=22469
- **OK** Navigation QA Agent: Route /object-issues. url=http://127.0.0.1:8765/object-issues; text=783
- **OK** Navigation QA Agent: Route /documents. url=http://127.0.0.1:8765/documents; text=2150
- **OK** Navigation QA Agent: Route /signals. url=http://127.0.0.1:8765/signals; text=2150
- **OK** Navigation QA Agent: Route /feedback. url=http://127.0.0.1:8765/feedback; text=2138
- **OK** Navigation QA Agent: Route /settings. url=http://127.0.0.1:8765/settings; text=2138
- **OK** Navigation QA Agent: Browser Back does not break app. url=http://127.0.0.1:8765/feedback
- **OK** Role QA Agent: owner: role today panel. panel=today-role-owner; visible=true
- **OK** Role QA Agent: owner: nav-objects. visible=true
- **OK** Role QA Agent: owner: nav-tasks. visible=true
- **OK** Role QA Agent: owner: nav-materials. visible=true
- **OK** Role QA Agent: construction_manager: role today panel. panel=today-role-project-manager; visible=true
- **OK** Role QA Agent: construction_manager: nav-objects. visible=true
- **OK** Role QA Agent: construction_manager: nav-tasks. visible=true
- **OK** Role QA Agent: construction_manager: nav-materials. visible=true
- **OK** Role QA Agent: construction_manager: nav-feedback. visible=true
- **OK** Role QA Agent: construction_manager: hides nav-estimates. visible=false
- **OK** Role QA Agent: foreman:7: role today panel. panel=today-role-foreman; visible=true
- **OK** Role QA Agent: foreman:7: nav-objects. visible=true
- **OK** Role QA Agent: foreman:7: nav-tasks. visible=true
- **OK** Role QA Agent: foreman:7: nav-materials. visible=true
- **OK** Role QA Agent: foreman:7: nav-photo-reports. visible=true
- **OK** Role QA Agent: foreman:7: hides nav-feedback. visible=false
- **OK** Role QA Agent: foreman:7: hides nav-estimates. visible=false
- **OK** Role QA Agent: foreman:7: hides nav-documents. visible=false
- **OK** Role QA Agent: master: role today panel. panel=today-role-worker; visible=true
- **OK** Role QA Agent: master: nav-tasks. visible=true
- **OK** Role QA Agent: master: nav-photo-reports. visible=true
- **OK** Role QA Agent: master: nav-object-issues. visible=true
- **OK** Role QA Agent: master: hides nav-objects. visible=false
- **OK** Role QA Agent: master: hides nav-materials. visible=false
- **OK** Role QA Agent: master: hides nav-feedback. visible=false
- **OK** Role QA Agent: master: hides nav-documents. visible=false
- **OK** Role QA Agent: procurement_manager: role today panel. panel=today-role-procurement; visible=true
- **OK** Role QA Agent: procurement_manager: nav-materials. visible=true
- **OK** Role QA Agent: procurement_manager: nav-objects. visible=true
- **OK** Role QA Agent: procurement_manager: nav-photo-reports. visible=true
- **OK** Role QA Agent: procurement_manager: hides nav-tasks. visible=false
- **OK** Role QA Agent: procurement_manager: hides nav-feedback. visible=false
- **OK** Role QA Agent: procurement_manager: hides nav-estimates. visible=false
- **OK** Role QA Agent: estimator: role today panel. panel=today-role-estimator; visible=true
- **OK** Role QA Agent: estimator: nav-estimates. visible=true
- **OK** Role QA Agent: estimator: nav-materials. visible=true
- **OK** Role QA Agent: estimator: nav-variations. visible=true
- **OK** Role QA Agent: estimator: nav-photo-reports. visible=true
- **OK** Role QA Agent: estimator: hides nav-feedback. visible=false
- **OK** Read-only Safety QA Agent: Audit login redirects to app. href=http://127.0.0.1:8765/?view=today&audit=1
- **OK** Read-only Safety QA Agent: Audit cookie is set for app path. kontur_session=true
- **OK** Read-only Safety QA Agent: Audit today page is visible. today-page=true
- **OK** Read-only Safety QA Agent: Live audit-login actual access. status=200; role=ai_auditor; href=http://127.0.0.1:8765/?view=today&audit=1; loginForm=false
- **WARN** Read-only Safety QA Agent: External cookie-limited viewer. unsupported: audit-login requires the client to keep a Secure HttpOnly SameSite=Lax session cookie. Use a full browser link or the read-only snapshot for cookieless AI viewers.
- **OK** Read-only Safety QA Agent: Audit write methods return 403. {"POST":403,"PUT":403,"PATCH":403,"DELETE":403}
- **OK** Read-only Safety QA Agent: Read-only write buttons are hidden or disabled. active_write_buttons=none
- **OK** Read-only Safety QA Agent: Sensitive data is hidden in auditor view. sensitive-patterns=0
- **OK** Mobile QA Agent: Viewport 390x844. nav=true; horizontalOverflow=false; actions=5; plusSeparated=true; plusBox=68x60@161; mobileMenuOk=true; moreVisible=true; feedbackMenuVisible=true; feedbackOpens=true; todayGridOk=true; minGridChildWidth=366; minDecisionWidth=340; minExpectedWidth=300; projectHeroOk=true; projectHero={"heroFound":true,"objectCards":3,"gridTemplate":"344px","gridColumns":1,"heroWidth":344,"mainWidth":344,"statsWidth":344,"statCards":5,"minStatWidth":168,"verticalTextCount":0,"verticalTextSamples":""}; estimatesOverlap=false; estimateRows=0; estimateRowBottom=0; navTop=781; photosOk=true; photoPreviewOk=true; photoPreview=dialog=true; media=true; close=true; next=true; counterBefore=147 / 149; counterAfter=148 / 149; slideshow=true; closed=true; photoLayoutChildren=2; photoMinLayoutWidth=366; photoCards=143; photoMinCardWidth=340; photoThumbs=149; photoMinThumbWidth=157; photoResponse=200; photoType=image/png
- **OK** Mobile QA Agent: Viewport 375x812. nav=true; horizontalOverflow=false; actions=5; plusSeparated=true; plusBox=68x60@154; mobileMenuOk=true; moreVisible=true; feedbackMenuVisible=true; feedbackOpens=true; todayGridOk=true; minGridChildWidth=351; minDecisionWidth=325; minExpectedWidth=300; projectHeroOk=true; projectHero={"heroFound":true,"objectCards":3,"gridTemplate":"329px","gridColumns":1,"heroWidth":329,"mainWidth":329,"statsWidth":329,"statCards":5,"minStatWidth":161,"verticalTextCount":0,"verticalTextSamples":""}; estimatesOverlap=false; estimateRows=0; estimateRowBottom=0; navTop=749; photosOk=true; photoPreviewOk=true; photoPreview=dialog=true; media=true; close=true; next=true; counterBefore=147 / 149; counterAfter=148 / 149; slideshow=true; closed=true; photoLayoutChildren=2; photoMinLayoutWidth=351; photoCards=143; photoMinCardWidth=325; photoThumbs=149; photoMinThumbWidth=150; photoResponse=200; photoType=image/png
- **OK** Mobile QA Agent: Viewport 430x932. nav=true; horizontalOverflow=false; actions=5; plusSeparated=true; plusBox=68x60@181; mobileMenuOk=true; moreVisible=true; feedbackMenuVisible=true; feedbackOpens=true; todayGridOk=true; minGridChildWidth=406; minDecisionWidth=380; minExpectedWidth=300; projectHeroOk=true; projectHero={"heroFound":true,"objectCards":3,"gridTemplate":"384px","gridColumns":1,"heroWidth":384,"mainWidth":384,"statsWidth":384,"statCards":5,"minStatWidth":188,"verticalTextCount":0,"verticalTextSamples":""}; estimatesOverlap=false; estimateRows=0; estimateRowBottom=0; navTop=869; photosOk=true; photoPreviewOk=true; photoPreview=dialog=true; media=true; close=true; next=true; counterBefore=147 / 149; counterAfter=148 / 149; slideshow=true; closed=true; photoLayoutChildren=2; photoMinLayoutWidth=406; photoCards=143; photoMinCardWidth=380; photoThumbs=149; photoMinThumbWidth=177; photoResponse=200; photoType=image/png
- **OK** Mobile QA Agent: Viewport 768x1024. nav=true; horizontalOverflow=false; actions=5; plusSeparated=true; plusBox=68x60@350; mobileMenuOk=true; moreVisible=true; feedbackMenuVisible=true; feedbackOpens=true; todayGridOk=true; minGridChildWidth=736; minDecisionWidth=710; minExpectedWidth=300; projectHeroOk=true; projectHero={"heroFound":true,"objectCards":3,"gridTemplate":"714px","gridColumns":1,"heroWidth":714,"mainWidth":714,"statsWidth":714,"statCards":5,"minStatWidth":136,"verticalTextCount":0,"verticalTextSamples":""}; estimatesOverlap=false; estimateRows=0; estimateRowBottom=0; navTop=961; photosOk=true; photoPreviewOk=true; photoPreview=dialog=true; media=true; close=true; next=true; counterBefore=147 / 149; counterAfter=148 / 149; slideshow=true; closed=true; photoLayoutChildren=2; photoMinLayoutWidth=736; photoCards=143; photoMinCardWidth=710; photoThumbs=149; photoMinThumbWidth=133; photoResponse=200; photoType=image/png
- **OK** UX Sanity QA Agent: No technical enum values in visible UI. none
- **OK** UX Sanity QA Agent: Task card has separated badges. cards=141; badges=423; expected_badges>=423
- **OK** UX Sanity QA Agent: Task card separates title, meta and status. cards=141; titles=141; meta=141; badges=423
- **OK** UX Sanity QA Agent: Task descriptions are collapsed in lists. cards=141; visible-list-descriptions=0
- **OK** UX Sanity QA Agent: Task list is grouped by role responsibility. cards=141; sections=3
- **OK** UX Sanity QA Agent: Today screen shows concrete attention block. length=823
- **OK** UX Sanity QA Agent: Today screen is role-aware. role-panels=6/6; owner=true; project_manager=true; foreman=true; worker=true; procurement=true; estimator=true
- **OK** UX Sanity QA Agent: Object cards are present. object_cards=2
- **OK** UX Sanity QA Agent: Blocker cards are present when blockers exist. blocker_cards=5
- **OK** UX Sanity QA Agent: Signal types are human-readable. technical-signal-type=false
- **OK** UX Sanity QA Agent: Signals do not repeat identical text consecutively. duplicate-consecutive=false
- **OK** UX Sanity QA Agent: Signal pluralization is correct. bad-plural=none
- **OK** UX Sanity QA Agent: Materials pipeline tabs are visible. tabs=true
- **OK** UX Sanity QA Agent: Material cards are present. material_cards=24
- **OK** Workflow QA Agent: Task workflow helpers are available. helpers_ready=true
- **OK** Workflow QA Agent: Task status aliases are canonical. {"newStatus":"new","inProgress":"in_progress","oldInProgress":"in_progress","waiting":"waiting_check","oldWaiting":"waiting_check","accepted":"accepted","cancelled":"cancelled"}
- **OK** Workflow QA Agent: Task execution overdue rules. {"newTask":true,"inProgress":true,"oldInProgress":true,"returned":true,"waitingCheck":false,"oldWaitingCheck":false,"accepted":false,"cancelled":false,"noDueDate":false}
- **OK** Workflow QA Agent: Task review overdue rules. {"waitingCheck":true,"oldWaitingCheck":true,"accepted":false,"inProgress":false}
- **OK** Workflow QA Agent: Task workflow technical statuses are hidden. none
- **OK** Photo Report Integrity QA Agent: Photo report integrity. emptyStatus=400; validStatus=201; validId=190; validReportsForTask=1; visibleInvalidEmpty=false
- **OK** Photo Report Integrity QA Agent: Photo report task link. taskId=166; validTaskId=166; taskStatus=waiting_check
- **OK** Photo Report Integrity QA Agent: Photo report deduplication. duplicateStatus=200; duplicate=true; duplicateSameId=true; reportsForTask=1
- **OK** Photo Report Integrity QA Agent: Missing photo report consistency. project=QA тестовый объект; noPhotoContainsProject=false
- **OK** Visual Regression QA Agent: Screenshot today. url=http://127.0.0.1:8765/today; expected_path=/today; urlOk=true; testid=today-page:true; title=Сегодня; expected_title=Сегодня; active=todayView:true; text=3912; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\today.png
- **OK** Visual Regression QA Agent: Screenshot projects. url=http://127.0.0.1:8765/objects; expected_path=/objects; urlOk=true; testid=objects-page:true; title=Объекты; expected_title=Объекты; active=projectsView:true; text=752; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\projects.png
- **OK** Visual Regression QA Agent: Screenshot tasks. url=http://127.0.0.1:8765/tasks; expected_path=/tasks; urlOk=true; testid=tasks-page:true; title=Задачи; expected_title=Задачи; active=tasksView:true; text=19901; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\tasks.png
- **OK** Visual Regression QA Agent: Screenshot materials. url=http://127.0.0.1:8765/materials; expected_path=/materials; urlOk=true; testid=materials-page:true; title=Материалы; expected_title=Материалы; active=materialsView:true; text=8294; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\materials.png
- **OK** Visual Regression QA Agent: Screenshot photos. url=http://127.0.0.1:8765/photo-reports; expected_path=/photo-reports; urlOk=true; testid=photo-reports-page:true; title=Фотоотчёты; expected_title=Фотоотчёты; active=photosView:true; text=18697; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\photos.png
- **OK** Visual Regression QA Agent: Screenshot object_remarks. url=http://127.0.0.1:8765/object-issues; expected_path=/object-issues; urlOk=true; testid=object-issues-page:true; title=Замечания по объектам; expected_title=Замечания по объектам; active=object_remarksView:true; text=979; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\object_remarks.png
- **OK** Visual Regression QA Agent: Screenshot documents. url=http://127.0.0.1:8765/documents; expected_path=/documents; urlOk=true; testid=documents-page:true; title=База знаний; expected_title=База знаний; active=documentsView:true; text=781; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\documents.png
- **OK** Visual Regression QA Agent: Screenshot dashboard. url=http://127.0.0.1:8765/signals; expected_path=/signals; urlOk=true; testid=signals-page:true; title=Сигналы; expected_title=Сигналы; active=dashboardView:true; text=2097; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\dashboard.png
- **OK** Visual Regression QA Agent: Screenshot feedback. url=http://127.0.0.1:8765/feedback; expected_path=/feedback; urlOk=true; testid=feedback-page:true; title=Обратная связь по программе; expected_title=Обратная связь по программе; active=feedbackView:true; text=13194; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\feedback.png
- **OK** Visual Regression QA Agent: Screenshot estimates. url=http://127.0.0.1:8765/?view=estimates; expected_path=/?view=estimates; urlOk=true; testid=estimates-page:true; title=Сметы; expected_title=Сметы; active=estimatesView:true; text=728; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\estimates.png
- **OK** Visual Density QA Agent: Desktop compact density. compact=true; kpis=6; maxMetricHeight=60; rowsInViewport=12; contentInViewport=16; maxRowHeight=116; maxContentHeight=712; maxPanelPadding=12; panelCount=6; horizontalOverflow=false; verticalText=false; primaryViolations=0
- **OK** Visual Density QA Agent: Mobile compact density. navButtons=5; minTouch=50; plusSeparated=true; horizontalOverflow=false; contentCovered=false
- **OK** D2Dom Control Prototype QA Agent: UI lab v3 has one D2DOM CONTROL concept. variants=; screens=3; expectedScreens=3; labelsOk=true; rejectedAbsent=true; actionRows=9; maxRowHeight=54; focusWidth=804; riskWidth=368; topbarControls=4; horizontalOverflow=false
- **OK** D2Dom Control Prototype QA Agent: Rejected ui-lab variants are archived. hasBanner=true; mentionsRejected=true; mentionsArchive=true; mentionsOldConcepts=true; horizontalOverflow=false
- **OK** D2Dom Control Prototype QA Agent: Screenshot d2dom-control-owner-1440x900.png. url=http://127.0.0.1:8765/ui-lab-v3?screen=owner&shot=1; activeScreen=owner; text=2299; actionRows=9; maxRowHeight=54; minTouch=999; topbarHeight=56; denseRowsOk=true; topbarOk=true; horizontalOverflow=false; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\d2dom-control-owner-1440x900.png
- **OK** D2Dom Control Prototype QA Agent: Screenshot d2dom-control-owner-1280x720.png. url=http://127.0.0.1:8765/ui-lab-v3?screen=owner&shot=1; activeScreen=owner; text=2299; actionRows=9; maxRowHeight=54; minTouch=999; topbarHeight=56; denseRowsOk=true; topbarOk=true; horizontalOverflow=false; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\d2dom-control-owner-1280x720.png
- **OK** D2Dom Control Prototype QA Agent: Screenshot d2dom-control-foreman-1440x900.png. url=http://127.0.0.1:8765/ui-lab-v3?screen=foreman&shot=1; activeScreen=foreman; text=1410; actionRows=8; maxRowHeight=54; minTouch=999; topbarHeight=56; denseRowsOk=true; topbarOk=true; horizontalOverflow=false; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\d2dom-control-foreman-1440x900.png
- **OK** D2Dom Control Prototype QA Agent: Screenshot d2dom-control-master-390x844.png. url=http://127.0.0.1:8765/ui-lab-v3?screen=master&shot=1; activeScreen=master; text=336; actionRows=3; maxRowHeight=160; minTouch=44; topbarHeight=0; denseRowsOk=true; topbarOk=true; horizontalOverflow=false; screenshot=C:\Users\seven\Documents\Codex\2026-04-25\new-chat\qa-artifacts\latest\screenshots\d2dom-control-master-390x844.png
- **OK** Console Error QA Agent: Browser console. No console/page/request errors.
- **OK** Data Integrity Agent: Agent runtime. checked_at=2026-07-02; violations=0
- **OK** Data Integrity Agent: Material stage/health vocabulary. invalid=0; stage={"approved":1,"delivered":1,"in_transit":1,"needs_approval":20}; health={"normal":6,"problem":17}
- **OK** Data Integrity Agent: Integrity violations report. total=0; critical=0; warnings=0; info=0; warning_types={}; autoFix=true; applied=2
- **OK** Data Integrity Agent: Safe auto-fix applied. mode=apply; actions=1; applied_entities=2
- **OK** MAX Report Format QA Agent: MAX report template. {"ok":true,"missing":[],"hasSectionBreaks":true,"hasLongSingleParagraph":false,"hasCorruptedText":false}

## Критические ошибки

Критических ошибок нет.

## Предупреждения

- Read-only Safety QA Agent: External cookie-limited viewer — unsupported: audit-login requires the client to keep a Secure HttpOnly SameSite=Lax session cookie. Use a full browser link or the read-only snapshot for cookieless AI viewers.

## Что исправлено

В рамках этого запуска исправления не выполнялись.

## Что не проверялось и почему

Все обязательные проверки запускались.

## QA coverage

- pages_checked: 10
- pages_verified_ok: 10/10
- visual_density_checks: 2/2
- role_panels_checked: 6/6
- task_cards_checked: 141
- task_workflow_sections_checked: 3
- object_cards_checked: 2
- blocker_cards_checked: 5
- material_cards_checked: 24
- workflow_rules_checked: 1
- photo_report_checks_checked: 1
- data_integrity_violations_checked: 0
- data_integrity_critical: 0
- data_integrity_warning_types: {}
- d2dom_control_v1_checks: 6
- d2dom_control_screens_checked: 7
- buttons_checked: 13
- feedback_rows_checked: 4
- mobile_viewports_checked: 4
- mobile_quick_actions_checked: 5
- readonly_write_methods_checked: 4/4
- screenshots_created: 10
- skipped_tests: 0 (QA-runner не пропускал проверки; skipped из отдельного Playwright-прогона смотрите в выводе Playwright.)

## Итог

PARTIAL
