# Постоянные правила проекта "Строительный контур"

1. Нельзя завершать задачу без QA.
2. После каждой правки кода, стилей, тестов, QA-скриптов или проектной документации запускать всех QA-агентов.
3. Scroll QA обязателен.
4. Button QA обязателен.
5. Navigation QA обязателен.
6. Role QA обязателен.
7. Mobile QA обязателен.
8. Read-only QA обязателен для audit-режима.
9. Console Error QA обязателен.
10. MAX-отчёт всегда форматировать через утверждённый шаблон.
11. Если проверка не запускалась, нельзя писать PASS.
12. Все ограничения и непроверенные пункты указывать честно.
13. При BLOCKER нельзя писать "готово".

## Усиленные правила Mobile QA

Mobile QA не считается пройденным, если проверено только открытие страницы. Агент обязан проверять реальную геометрию интерфейса и рабочие действия на мобильных viewport:

- 390x844;
- 375x812;
- 430x932;
- 768x1024.

После каждой правки CSS/JS/HTML обязательно проверять:

1. Основные рабочие сетки на телефоне складываются в одну колонку, а не остаются двумя узкими колонками.
2. На страницах "Сегодня", "Объекты", "Задачи", "Сметы", "Материалы", "Фотоотчёты", "Замечания", "База знаний" и "Обратная связь" нет узких колонок, где слова идут вертикально по буквам.
3. Минимальная ширина ключевых карточек на телефоне должна быть близка к ширине экрана: не меньше `min(300px, viewport - 40px)`.
4. Карточки "Требует решения", "Задачи на сегодня", "Материалы под риском" и "Фотоотчёты" не должны сжиматься уже 300 px на стандартных телефонах.
5. В разделе "Фотоотчёты" обязательно должен проверяться реальный фотоотчёт с превью.
6. Превью фотоотчёта не должно быть уже 120 px.
7. Ссылка на фото в фотоотчёте должна возвращать HTTP 200 и `Content-Type: image/*`, а не пустой внешний экран и не 302 на сторонний downloader для обычных изображений.
8. Нижнее мобильное меню не должно перекрывать последнюю карточку длинных списков.
9. Если список длинный, проверять не только `scrollWidth`, но и реальную прокрутку до последней карточки.
10. В мобильном меню должна быть возможность открыть полный список доступных разделов через "Ещё"; для руководителя обязательно проверять вход в "Обратную связь".
11. Если кнопка или карточка видна, но действие даёт 403 для роли, которой этот файл или вложение должно быть доступно, это BLOCKER.
12. После изменения CSS/JS/HTML обязательно обновлять версию `sw.js`, query-string ассетов и проверять, что PWA не держит старый кэш.

Если любая из этих проверок не запускалась, итог Mobile QA не может быть PASS.

Программный вызов `window.scrollTo(...)` не доказывает, что пользователь может прокручивать длинную страницу пальцем. Mobile QA обязан выполнить реальный touch-жест в браузере, записать положение страницы до и после жеста и считать проверку проваленной, если контент выше экрана, а прокрутка не изменилась. Страница «Сметы» входит в обязательный набор.

## Закрытие замечаний коллег

Когда задача поступила из обратной связи коллег, ведущий QA-агент обязан:

1. Прочитать сообщение и все приложенные скриншоты или файлы до начала правок.
2. Воспроизвести видимую проблему либо зафиксировать доказательство, почему она не воспроизводится.
3. Добавить регрессионную проверку для каждого подтверждённого дефекта.
4. Не переводить замечание в «Готово», если исправление находится только в ветке и ещё не опубликовано.
5. После проверки отправить в MAX структурированный отчёт без технических деталей; если публикации не было, прямо написать, что изменения готовятся к ближайшему обновлению.

## Обязательный quality gate

Перед финальным сообщением после любых изменений Codex обязан сам запустить полный QA-контур. Нельзя перекладывать этот запуск на пользователя и нельзя писать "готово", если агенты не запускались.

```bash
npm run lint
npm run typecheck
npm run test
npm run test:qa
npm run test:qa:scroll
npm run test:qa:buttons
npm run test:qa:mobile
npm run test:qa:readonly
npm run test:qa:report
```

Дополнительно после правок QA-инфраструктуры запускать:

```bash
npm run qa
npm run qa:snapshots
npm run qa:report
```

Если локально нет `npm`, нужно запустить эквивалентные команды через Node:

```bash
node tools/qa/run-quality-gate.mjs --suite lint
node tools/qa/run-quality-gate.mjs --suite typecheck
node tools/qa/run-quality-gate.mjs --suite unit
node tools/qa/run-quality-gate.mjs --suite all
node tools/qa/run-quality-gate.mjs --suite scroll
node tools/qa/run-quality-gate.mjs --suite buttons
node tools/qa/run-quality-gate.mjs --suite mobile
node tools/qa/run-quality-gate.mjs --suite readonly
node tools/qa/run-quality-gate.mjs --suite report
node tools/qa/qa-fix-orchestrator.mjs --fix --full
node tools/qa/visual-snapshots.mjs
node scripts/generate-qa-report.js
```

В отчёте обязательно указать, если вместо npm использовался fallback-запуск.

Если часть агентов не запущена из-за отсутствия окружения или внешней зависимости, итог задачи может быть только PARTIAL или FAIL с явной причиной в финальном ответе.

## BLOCKER-ошибки

Следующие ошибки блокируют завершение задачи:

1. Не работает прокрутка колёсиком мышки.
2. Страница не скроллится при контенте выше viewport.
3. Активные кнопки ничего не делают.
4. Основные разделы не открываются.
5. Белый экран.
6. Бесконечная загрузка.
7. Ошибка JavaScript на главной.
8. Сломана мобильная навигация.
9. На мобильном экране карточки сжаты в узкие колонки, текст идёт вертикально или элементы налезают друг на друга.
10. Фотоотчёты видны, но сами фото не открываются.
11. ИИ-аудитор может менять данные.
12. Пользователь видит технические enum-статусы.
13. Snapshot показывает ok, хотя тест не запускался.
14. MAX-отчёт отправлен одним полотном без структуры.

При наличии BLOCKER итог только FAIL.

## MAX-отчёт

Финальный отчёт в MAX формируется только через единый formatter:

```bash
node tools/qa/max-report-cli.mjs --report qa-artifacts/latest/qa-report.json
```

Нельзя отправлять raw-текст одним полотном.
## Media preview QA

Mobile QA must verify the full photo/video viewing loop, not only the download URL:

1. Tap/click a photo report thumbnail.
2. The media must open inside Kontur, not leave the app without a visible return path.
3. The preview must show a clear close/back control.
4. If a report has two or more photos, the preview must show previous/next slideshow controls and the counter must change after tapping next/previous.
5. Closing the preview must return to the same screen without losing scroll or opening a blank external page.
6. If a visible photo/video has no working close/back path or slideshow controls do not switch slides, Mobile QA must fail.

## Working cycles QA

For the "working cycles and real-use UX" stage, QA must verify business logic, not just that screens render:

1. A task with status `accepted`, `cancelled`, `closed`, `waiting_check`, or legacy `completed_pending_acceptance` must not count as execution-overdue.
2. A task with status `waiting_check` or legacy `completed_pending_acceptance` can only be review-overdue when `review_due_at` is overdue.
3. Legacy task statuses must stay backward-compatible:
   - `completed_pending_acceptance` is treated as `waiting_check`;
   - `in_progress_task` and `review` are treated as `in_progress`.
4. A visible task card must show one clear next action by current status:
   - `new` -> `Принять в работу`;
   - `in_progress` -> `Отправить на проверку`;
   - `waiting_check` -> reviewer can accept/return, assignee sees waiting state;
   - `returned` -> `Продолжить работу`;
   - `accepted` -> no active action.
5. The tests `task-state-machine.spec.ts` and `task-overdue-rules.spec.ts` are mandatory for Release A changes.
6. If these tests do not run, Release A cannot be marked PASS.
7. `Workflow QA Agent` must run inside `npm run test:qa` / `npm run test:qa:report`; if workflow checks are not run or fail, the task lifecycle release cannot be marked PASS.
8. The test `role-task-ownership.spec.ts` is mandatory for Release B1 changes that group tasks by role responsibility.

## QA Fix Agents

Codex works as a QA-fix team for this project. After code changes, it must run the QA cycle, classify issues, fix safe problems, rerun checks, and write the current report to:

- `qa-artifacts/latest/qa-report.md`
- `qa-artifacts/latest/qa-report.json`
- `qa-reports/latest-report.md`
- `qa-reports/latest-report.json`

This rule is automatic and applies after every edit made by Codex. The agent must not wait for a separate reminder to run QA.

The lead agent is `Lead QA Fix Architect`. It coordinates:

1. Code Review Fix Agent.
2. Frontend QA Fix Agent.
3. UI Consistency Fix Agent.
4. UX Fix Agent.
5. Regression Fix Agent.
6. Playwright E2E Agent.
7. Accessibility Fix Agent.
8. Performance Fix Agent.
9. Security Check Agent.
10. Visual Snapshot Agent.

Safe fixes may be applied automatically:

- lint/typecheck/build fixes that do not change business behavior;
- small UI and responsive layout fixes;
- broken click handlers, tabs, internal links, modal close/open logic;
- missing loading/error/success states;
- missing labels, alt text, `aria-label`, focus-visible styles;
- unsafe `target="_blank"` without `rel="noopener noreferrer"`;
- report generation, screenshots, QA scripts and stable test ids;
- Playwright test hardening that uses only test data.
- safe data-integrity cleanup after backup: duplicate notifications, notifications pointing to missing entities, stale "no photo report" signals, photo report counters, and clearly duplicated manual photo reports may be fixed automatically without deleting business documents, tasks, projects, materials or contracts.

Dangerous changes require explicit owner approval before editing:

- deleting major project sections;
- changing application architecture;
- changing database schema or migrations;
- changing authentication, sessions, roles or permissions;
- changing API contracts;
- changing deploy, domains or production publication flow;
- changing tokens, keys or secrets;
- deleting dependencies;
- deleting working business logic;
- modifying real production data outside the approved safe cleanup flow.
- applying data cleanup without a backup.

Production deploy is never part of an automatic QA-fix cycle. Deploy requires a separate explicit instruction.

## Staging-first UI redesign

Large UX/UI redesign work must go through staging before production.

1. Do not deploy redesign changes directly to production while colleagues are using the main site.
2. Use `codex/ui-redesign-staging` for redesign releases.
3. Deploy redesign work to the staging site first.
4. Keep staging data in a separate Docker volume from production.
5. Before every staging release, keep a rollback commit/hash.
6. Before every production release, run a production backup and record the previous production commit.
7. Production promotion requires explicit approval after staging review.
8. The Claude Design prototype is a reference and task brief, not production code.
9. Do not ship Claude runtime tags such as `sc-if`, `sc-for`, or `{{ }}` to production.
10. Each redesign release must be small enough to revert safely.

## Today object collapse QA

When the "Сегодня" screen contains object cards, QA must verify that each object card stays compact by default and exposes an explicit expand/collapse action.

Required checks:

1. At least one `[data-today-project-card]` is present when active objects exist.
2. `[data-testid="today-object-details"]` is not visible before expansion.
3. `[data-toggle-today-project]` is visible and changes text between `Развернуть` and `Свернуть`.
4. Clicking expand shows object details without navigating away from "Сегодня".
5. Clicking collapse hides object details again.
6. The separate `Открыть` action still opens the object card.

If object details are expanded by default and make the dashboard visually noisy, UX QA must fail.

## QA Fix Commands

Use these commands for the autonomous QA-fix loop:

```bash
npm run qa
npm run qa:e2e
npm run qa:snapshots
npm run qa:report
```

`npm run qa` runs `tools/qa/qa-fix-orchestrator.mjs` and may apply safe workspace fixes. It must not deploy to production.

Visual snapshots are stored in `qa-snapshots`.

## Приёмка дизайна и адаптивности

Каждое изменение Frontend или UX перед общим quality gate должно пройти две последовательные проверки:

1. `Zina Page Designer` проверяет актуальный визуальный паспорт, типографику, цвета, иерархию, отступы, элементы управления, карточки, состояния и длинные тексты. Нельзя смешивать старую и новую визуальные системы.
2. `Rada Responsive QA` проверяет реальный отрисованный интерфейс на ширинах `320`, `360`, `390`, `430`, `768`, `1024`, `1280`, `1440` и `1920` px.

Проверка адаптивности обязана охватывать все роли, которых затрагивает изменение, и использовать одновременно скриншоты и геометрические проверки. Если ожидаемая ролевая панель, рабочая карточка, главное действие или пункт мобильного меню не найдены, результат должен быть `FAIL` или `PARTIAL`. Нулевое число найденных обязательных элементов никогда не считается `OK`.

Интерфейс не готов, пока остаётся визуальная проблема уровня `Blocker` или `Major`. К таким проблемам относятся горизонтальная прокрутка всей страницы, обрезанный или вертикальный текст по одной букве, наложение закреплённой навигации, недоступные действия, неполное мобильное меню, смешение шрифтов и большие пустые зоны из-за растянутых параллельных колонок.

## Employee-facing MAX updates

Starting with the next MAX message, employee-facing updates must be visually easier to read and more polished than a plain text list.

Rules for colleague-facing MAX messages:

1. Do not include technical details: commits, file names, test names, server paths, implementation reasons, stack traces, or internal QA wording.
2. Use a clear title with an emoji and bold text.
3. Split the message into short sections with bold headings and emojis.
4. Use visual markers for each item:
   - `✅` for what is ready;
   - `🆕` for what is new;
   - `📱` for mobile changes;
   - `📎` for files/documents;
   - `🧭` for where to find it;
   - `🙏` for requests to colleagues.
5. Keep each bullet short: one idea per line.
6. Separate blocks with blank lines so the message does not look like one continuous wall of text.
7. If some changes are only prepared but not deployed, write it plainly as "готовится к ближайшему обновлению", not as if it is already available.
8. End with a simple action for colleagues: what to check, where to click, or what screenshot to send.
9. Before sending, check that Russian text is readable and not replaced by question marks.
10. Send through `app/send_max_message.py --message-base64` or the container equivalent, never through raw shell text.

Preferred structure:

```text
**✅ Строительный контур — обновление**

**🆕 Что появилось**
— ...

**📱 Что стало удобнее**
— ...

**🧭 Где проверить**
— ...

**🙏 Просьба**
— ...
```

## Release A2 photo report QA

Release A2 changes are not complete until the following checks are present in `qa-report.json` and snapshot:

1. `photo_report_integrity`: a photo report without files must be rejected with 400; a report with at least one file must be accepted.
2. `photo_report_task_link`: a photo report tied to a task must store `task_id` and move the task to `waiting_check`.
3. `photo_report_deduplication`: repeating upload for the same task must return the existing active report instead of creating a duplicate.
4. `missing_report_consistency`: an object with a valid photo report for today must not appear in the "no photo report today" signal.
5. Existing empty reports must be marked `invalid_empty`; existing repeated active reports must be marked `duplicate`.
6. `Photo Report Integrity QA Agent` is mandatory in `npm run test:qa` / `npm run test:qa:report`.
7. `tests/e2e/photo-report-integrity.spec.ts` must pass on desktop and mobile.
8. If `photo_report_integrity`, `photo_report_deduplication`, `photo_report_task_link`, or `missing_report_consistency` is `not_run`, `partial`, or `failed`, Release A2 cannot be marked production-ready.

Scroll QA must reset scroll positions before measuring wheel movement. A page that is already at the bottom must not produce a false scroll failure, but a genuinely non-scrollable long page is still a BLOCKER.
