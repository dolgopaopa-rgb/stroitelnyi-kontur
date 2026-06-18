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
4. Closing the preview must return to the same screen without losing scroll or opening a blank external page.
5. If a visible photo/video has no working close/back path, Mobile QA must fail.
