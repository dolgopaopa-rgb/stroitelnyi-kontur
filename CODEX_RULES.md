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

Если локально нет npm, нужно запустить эквивалентные команды через Node:

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
9. ИИ-аудитор может менять данные.
10. Пользователь видит технические enum-статусы.
11. Snapshot показывает ok, хотя тест не запускался.
12. MAX-отчёт отправлен одним полотном без структуры.

При наличии BLOCKER итог только FAIL.

## MAX-отчёт

Финальный отчёт в MAX формируется только через единый formatter:

```bash
node tools/qa/max-report-cli.mjs --report qa-artifacts/latest/qa-report.json
```

Нельзя отправлять raw-текст одним полотном.
