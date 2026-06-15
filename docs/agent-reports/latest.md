# Отчет QA-агента

- Дата: 2026-06-15 08:42:57 +0300
- Адрес: `http://127.0.0.1:8877`
- OK: 57
- WARN: 0
- FAIL: 0

## Проверки

### OK - UI buttons contract

Ключевые кнопки найдены в HTML и имеют обработчики в app.js.

### OK - UI forms contract

Ключевые формы найдены и отправляются через ожидаемые API.

### OK - Login page contract

Страница входа, кнопка видимости пароля и серверный endpoint логина найдены.

### OK - Android PWA install scenario

Контур можно установить на Android как приложение: manifest и service worker доступны до логина, на входе и внутри приложения есть кнопка установки.

### OK - Android APK wrapper scenario

Контур можно собрать в APK: нативная Android-обертка открывает боевой сайт, поддерживает вход, загрузку файлов, скачивание и внешние ссылки.

### OK - Dashboard feedback scenario

Главный экран должен быть пультом управления: нулевые сигналы не шумят, агент компактный, уведомления сгруппированы по объектам, а задачи имеют обсуждение.

### OK - Task workflow detail scenario

Карточка задачи хранит рабочий контекст: дата начала, приоритет, договор/доп. соглашение, история, комментарии, вложения, частичное выполнение и перенос срока.

### OK - Task collapsible rows scenario

Task rows must collapse and expand inline on mobile, so users do not have to scroll past long opened task cards.

### OK - Project detail toggle scenario

Project rows must work like an accordion on mobile: tapping a project opens details, tapping the same project again hides details and returns to the plain object list.

### OK - Mobile document download scenario

Document downloads must work on mobile browsers and external viewers: HEAD requests, byte ranges, streamed local files, and Yandex Disk redirects are supported.

### OK - Mobile load stability scenario

Mobile startup must stay light, recover from stale PWA cache after deploys, and serve a Huawei-compatible frontend bundle.

### OK - Mobile pull refresh and loading indicator scenario

On phones every page can be refreshed with a downward pull, and explicit long actions show an Apple-like loading indicator instead of looking frozen.

### OK - Feedback refresh scenario

Раздел обратной связи должен подтягивать свежие сообщения без закрытия страницы.

### OK - Feedback actions implementation scenario

Новые замечания из MAX закрыты в интерфейсе: принятые задачи не шумят на рабочем столе, карточка объекта компактнее, доп. соглашения называются правильно.

### OK - Role persistence scenario

Выбранная тестовая роль сохраняется после обновления страницы.

### OK - New project draft scenario

Карточка нового объекта имеет автосохранение текстовых полей, понятные ошибки и показывает уже сохраненные файлы черновика.

### OK - Navigation access scenario

Меню ограничивается по ролям менеджера и прораба.

### OK - Estimate job CRM scenario

Менеджер, сметчик, гендиректор и руководитель строительства видят отдельный реестр сметных заданий со сроками и статусами.

### OK - Estimate return and photo carousel scenario

Сметчик может вернуть неполное задание менеджеру, задать уточняющий вопрос без возврата, а фото задания открываются каруселью на телефоне.

### OK - Estimate question completion scenario

После уточняющего вопроса сметчик может сдать смету и приложить файлы результата.

### OK - Estimate file versions scenario

После сдачи сметы можно добавить файл, заменить текущий файл с историей версий, сохранить ссылку на Сметтер и удалить лишний файл.

### OK - Estimate links and print scenario

В сметном задании видны активные ссылки на Сметтер и есть быстрый вывод вложений на печать.

### OK - Restricted topbar controls scenario

Обычные участники не видят переключатель ролей и кнопку обновления, но видят выход.

### OK - New project contact fields scenario

Новая карточка объекта требует телефон, e-mail и ссылку на локацию из Яндекса.

### OK - Addendum Smetter files scenario

Материалы и работы по доп. соглашению загружаются файлами Excel из Сметтера и разносятся в заявки/допработы.

### OK - Mobile material accordion scenario

Раскрытые разделы материалов не схлопываются при прокрутке на мобильном.

### OK - Material request traceability scenario

Заявка материалов показывает кто заказал, объект, основания позиций, связь с допработами и фактическую стоимость закупки, а сметчик получает сигнал по позициям вне основной сметы или закупке дороже сметы.

### OK - Material request direct open scenario

Заявка материалов должна открываться по уведомлению или прямой ссылке даже после смены фильтра/обновления списка.

### OK - Project financial summary scenario

Карточка объекта показывает не одну слепую сумму, а сводку: основная смета, принятые допработы/доп. соглашения, итог и нерешенный сверхбюджет.

### OK - Material receipt confirmation scenario

Прораб видит, когда можно подтвердить получение доставки материалов, и может отправить проблему с фото/видео.

### OK - MAX outgoing encoding scenario

Сообщения бота в MAX отправляются в безопасной для кириллицы кодировке и остаются читаемыми: жирный заголовок, абзацы и отдельная строка ссылки.

### OK - Feedback corrupted comment guard scenario

Обратная связь не показывает и не сохраняет служебные комментарии, которые превратились в набор вопросительных знаков.

### OK - Knowledge base construction manager scenario

Руководитель строительства может добавлять материалы в базу знаний.

### OK - Knowledge base folders scenario

База знаний работает как файловый менеджер: текущая папка, хлебные крошки, загрузка файлов и папок, перенос старых материалов и drag-and-drop.

### OK - Project approval guard

Менеджер не может принять объект в работу вместо руководителя строительства.

### OK - Project documentation multi-upload scenario

Проектную документацию можно добавить сразу несколькими файлами, без замены уже сохраненных документов.

### OK - Variation attachments scenario

К допработе можно приложить фото, видео или документ, а вложение видно в карточке допработы.

### OK - Yandex route links scenario

Ссылки локаций открывают Яндекс.Карты в режиме построения маршрута.

### OK - Permanent delete guard

Удаление навсегда разрешено только гендиректору.

### OK - Repository PWA cache contract

Версия фронтенда `20260615-project-history-max` есть в service worker.

### OK - Huawei compatible startup syntax

Runtime mobile bundle, login page, and service worker avoid optional chaining/nullish coalescing.

### OK - Homepage

Главная страница вернула HTTP 200.

### OK - Page title/content

В HTML найдено название продукта.

### OK - Production version

Production и репозиторий используют одну версию фронтенда: 20260615-project-history-max.

### OK - Asset app.js

app.js доступен: /static/app.compat.js?v=20260615-project-history-max

### OK - Asset styles.css

styles.css доступен: /static/styles.css?v=20260615-project-history-max

### OK - Asset manifest

manifest доступен: /static/manifest.webmanifest?v=20260611-android-pwa

### OK - MAX chat draft fix

Во фронтенде есть защита от сброса поля MAX chat_id при автообновлении.

### OK - Material request traceability

В заявках материалов видны основания и место, куда внесены допы/отклонения.

### OK - Dashboard attention panel

На рабочем столе есть блок контроля сигналов агента.

### OK - PWA cache version

Версия service worker актуальна для текущей фронтенд-правки.

### OK - API /api/session

Endpoint доступен и возвращает JSON.

### OK - API /api/users

Endpoint доступен и возвращает JSON.

### OK - API /api/projects

Endpoint доступен и возвращает JSON.

### OK - API /api/tasks

Endpoint доступен и возвращает JSON.

### OK - API /api/material-requests

Endpoint доступен и возвращает JSON.

### OK - API /api/summary

Endpoint доступен и возвращает JSON.

## Рекомендации агента

### Строительный процесс

- **MEDIUM · Объекты без полного комплекта Сметтер-файлов: 1**
  Материалы и работы должны расходиться по разным выгрузкам, иначе прораб и снабжение будут видеть лишнее.
  Действие: В карточке объекта явно показывать отсутствие файла материалов или задания на работы.

### Снабжение

- **HIGH · Материальные заявки требуют отдельного внимания**
  Возвращено: 0, проблемы приемки: 1, срочные: 0.
  Действие: Держать проблемные и срочные заявки на рабочем столе, а не только внутри раздела Материалы.

### Финансовый контроль

- **HIGH · Есть сверхбюджет без решения**
  Сверхбюджет должен стать допработой, расходом компании или отдельным согласованным решением.
  Действие: Держать сумму сверхбюджета на рабочем столе для ролей с финансовым доступом.

### Инженерия и уведомления

- **MEDIUM · MAX не привязан у сотрудников: 11**
  Личные уведомления не будут надежными, пока все ключевые роли не привязаны к MAX.
  Действие: Показывать непривязанные MAX-уведомления как отдельный сигнал для руководителей.

### Дизайн и управление

- **ACCEPTED · Блок внимания на рабочем столе принят**
  В интерфейсе уже есть точка входа для просрочек, приемки, проблемных материалов и организационных рисков.
  Действие: Проверить с руководителями, не нужно ли менять порядок сигналов.

## Инженерный взгляд

Сначала исправлять все FAIL. Если проверка ограничена авторизацией, нужно добавить GitHub Secrets и повторить запуск.

## Дизайнерский взгляд

Интерфейс должен оставаться плотным, дорогим и рабочим: меньше пустоты, аккуратные статусы, спокойный графитовый каркас, глубокий зеленый для действия и теплый золотой акцент для важного.

## Строительная логика

При проверке новых функций агент смотрит, к какому объекту, договору, смете, этапу, роли и уведомлению относится действие. Если действие нельзя объяснить без чата, интерфейс нужно упрощать.

## Следующие действия

1. Технически сайт работает, но есть сильные процессные рекомендации. Их стоит разобрать до следующего цикла доработок.
2. После изменений добавить запись в `docs/16-project-worklog.md`.
