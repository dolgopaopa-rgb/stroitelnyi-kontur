# Постоянные правила проекта "Строительный контур"

1. Нельзя завершать задачу без QA.
2. После каждой UX/Frontend-правки запускать QA-агентов.
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

## Обязательный quality gate

Перед финальным сообщением после изменений запустить:

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
```

В отчёте обязательно указать, если вместо npm использовался fallback-запуск.

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
