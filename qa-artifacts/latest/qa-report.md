# QA report

- Дата: 2026-06-16T14:21:58.129Z
- Версия/commit: 2026.06.16-qa / 958634f
- URL: http://127.0.0.1:8891
- Итог: **PASS**

## QA-агенты

- QA Orchestrator Agent
- Scroll QA Agent
- Button QA Agent
- Navigation QA Agent
- Role QA Agent
- Read-only Safety QA Agent
- UX Sanity QA Agent
- Mobile QA Agent
- Console Error QA Agent
- Visual Regression QA Agent
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
    }
  ]
}
- **OK** QA Orchestrator Agent: Typecheck. JS syntax is valid.
- **OK** QA Orchestrator Agent: Unit smoke. db ok
- **OK** QA Orchestrator Agent: No white screen. Visible text length: 1785
- **OK** QA Orchestrator Agent: No endless loader. Loader nodes: 0
- **OK** Scroll QA Agent: Wheel scroll: today. scrollable=true; moved=true
- **OK** Scroll QA Agent: Wheel scroll: projects. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: tasks. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: materials. scrollable=true; moved=true
- **OK** Scroll QA Agent: Wheel scroll: photos. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: object_remarks. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: documents. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: dashboard. scrollable=false; moved=false
- **OK** Scroll QA Agent: Wheel scroll: feedback. scrollable=true; moved=true
- **OK** Scroll QA Agent: Scroll not locked after checks. overflow locked=false
- **OK** Button QA Agent: Open objects. before=Сегодня; after=Объекты
- **OK** Button QA Agent: Open tasks. before=Объекты; after=Задачи
- **OK** Button QA Agent: Open materials. before=Задачи; after=Материалы
- **OK** Button QA Agent: Open documents. before=Материалы; after=База знаний
- **OK** Button QA Agent: Open feedback. before=База знаний; after=Обратная связь по программе
- **OK** Button QA Agent: Mobile + opens actions. actions=5
- **OK** Navigation QA Agent: Route /today. url=http://127.0.0.1:8891/today; text=1785
- **OK** Navigation QA Agent: Route /objects. url=http://127.0.0.1:8891/objects; text=571
- **OK** Navigation QA Agent: Route /tasks. url=http://127.0.0.1:8891/tasks; text=707
- **OK** Navigation QA Agent: Route /materials. url=http://127.0.0.1:8891/materials; text=1914
- **OK** Navigation QA Agent: Route /photo-reports. url=http://127.0.0.1:8891/photo-reports; text=770
- **OK** Navigation QA Agent: Route /object-issues. url=http://127.0.0.1:8891/object-issues; text=866
- **OK** Navigation QA Agent: Route /documents. url=http://127.0.0.1:8891/documents; text=668
- **OK** Navigation QA Agent: Route /signals. url=http://127.0.0.1:8891/signals; text=1082
- **OK** Navigation QA Agent: Route /feedback. url=http://127.0.0.1:8891/feedback; text=1860
- **OK** Navigation QA Agent: Route /settings. url=http://127.0.0.1:8891/settings; text=5287
- **OK** Navigation QA Agent: Browser Back does not break app. url=http://127.0.0.1:8891/feedback
- **OK** Role QA Agent: owner: nav-objects. visible=true
- **OK** Role QA Agent: owner: nav-tasks. visible=true
- **OK** Role QA Agent: owner: nav-materials. visible=true
- **OK** Role QA Agent: construction_manager: nav-objects. visible=true
- **OK** Role QA Agent: construction_manager: nav-tasks. visible=true
- **OK** Role QA Agent: construction_manager: nav-materials. visible=true
- **OK** Role QA Agent: foreman:7: nav-tasks. visible=true
- **OK** Role QA Agent: foreman:7: nav-materials. visible=true
- **OK** Role QA Agent: foreman:7: nav-documents. visible=true
- **OK** Role QA Agent: master: nav-tasks. visible=true
- **OK** Role QA Agent: master: nav-photo-reports. visible=true
- **OK** Role QA Agent: procurement_manager: nav-materials. visible=true
- **OK** Role QA Agent: procurement_manager: nav-objects. visible=true
- **OK** Role QA Agent: estimator: nav-estimates. visible=true
- **OK** Role QA Agent: estimator: nav-materials. visible=true
- **OK** Read-only Safety QA Agent: Audit login diagnostic. Строительный контур
◉
Сегодня
⌂
Сигналы
▦
Объекты
≋
Сметы
✓
Задачи
▤
Работы
◫
Материалы
＋
Допработы
!
Замечания
▣
Фотоотчёты
⌖
Локации
◧
База знаний
✉
Обратная связь по программе
◷
Журнал
Сегодня
Выйти
Руководитель компании
Где горит и где нужно моё решение?

Показываем просрочки, блокеры, материалы под риском и объекты с проблемами по всей компании.

Посмотреть сигналы
Проблемные объекты
Открыть задачи
Задачи и решения на сегодня
Открыть задачи
На сегодня задач нет

Проверьте просроченные или о
- **OK** Read-only Safety QA Agent: Audit write methods return 403. POST /api/tasks -> 403
- **OK** Read-only Safety QA Agent: Sensitive data is hidden in auditor view. sensitive-patterns=0
- **OK** Mobile QA Agent: Viewport 390x844. nav=true; horizontalOverflow=false; actions=5
- **OK** Mobile QA Agent: Viewport 375x812. nav=true; horizontalOverflow=false; actions=5
- **OK** Mobile QA Agent: Viewport 430x932. nav=true; horizontalOverflow=false; actions=5
- **OK** Mobile QA Agent: Viewport 768x1024. nav=true; horizontalOverflow=false; actions=5
- **OK** UX Sanity QA Agent: No technical enum values in visible UI. none
- **OK** UX Sanity QA Agent: Task card has separated badges. cards=0; badges=0
- **OK** UX Sanity QA Agent: Today screen shows concrete attention block. length=499
- **OK** Visual Regression QA Agent: Screenshot today. text=1681
- **OK** Visual Regression QA Agent: Screenshot projects. text=496
- **OK** Visual Regression QA Agent: Screenshot tasks. text=632
- **OK** Visual Regression QA Agent: Screenshot materials. text=1817
- **OK** Visual Regression QA Agent: Screenshot documents. text=491
- **OK** Console Error QA Agent: Browser console. No console/page/request errors.
- **OK** MAX Report Format QA Agent: MAX report template. {"ok":true,"missing":[],"hasSectionBreaks":true,"hasLongSingleParagraph":false}

## Критические ошибки

Критических ошибок нет.

## Предупреждения

Предупреждений нет.

## Что исправлено

В рамках этого запуска исправления не выполнялись.

## Что не проверялось и почему

Все обязательные проверки запускались.

## Итог

PASS
