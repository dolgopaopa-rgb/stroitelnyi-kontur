# Responsive QA — тестовый Контур — 2026-08-31

## Scope

- Project: Строительный контур Д²ДОМ.
- Routes: `/today`, `/signals`, `/objects`, `/tasks`, `/photo-reports`, `/settings`; прямые маршруты `/estimates`, `/works`, `/variations`, `/locations`.
- States and critical paths: оболочка, навигация, мобильное меню, длинные тексты, вложения, недоступный предпросмотр, журнал целостности данных.
- Source revision or build: `fadd119` плюс исправления рабочей ветки `codex/ui-redesign-staging`.
- Audit mode: recheck.

## Environment

- Browser and version: Google Chrome через Playwright 1.60.0.
- Rendering source: локальный сервер `127.0.0.1:8891`.
- Emulation or real device: CSS viewport emulation; реальный Mac не использовался.
- Continuous sweep: `320–1920` CSS px, шаг `16px`; дополнительно `2560`, `3440`, `3840`.
- Known limitations: системный zoom и нативный рендеринг шрифтов macOS требуют ручного подтверждения на Mac.

## Matrix

| Class | CSS viewport | Orientation/state | Evidence | Overflow delta | Result | Notes |
|---|---:|---|---|---:|---|---|
| Narrow phone | `320×568` | portrait | `crm-theme-320.png` | 0 | PASS | Шапка 59px, нижняя навигация |
| Small phone | `360×640` | portrait | automated | 0 | PASS | Команды не обрезаны |
| Phone | `375×667` | portrait | automated | 0 | PASS | Breakpoint stable |
| Phone | `390×844` | portrait | `crm-theme-390.png` | 0 | PASS | Touch targets не меньше 44px |
| Large phone | `430×932` | portrait | automated | 0 | PASS | Нет overlap |
| Foldable | `720×840` | unfolded | `crm-theme-720.png` | 0 | PASS | Контент видим без reload |
| Foldable | `832×750` | landscape-like | `crm-theme-832.png` | 0 | PASS | Нижняя навигация доступна |
| Tablet | `768×1024` | portrait | automated | 0 | PASS | Рабочая область начинается на 71px |
| Tablet | `1024×768` | landscape | automated | 0 | PASS | Мобильная оболочка до 1100px |
| Breakpoint | `1100×900` | mobile shell | `crm-theme-1100.png` | 0 | PASS | Sidebar hidden, bottom nav visible |
| Breakpoint | `1101×900` | desktop shell | `crm-theme-1101.png` | 0 | PASS | Sidebar visible, bottom nav hidden |
| Laptop | `1280×720` | landscape | `crm-theme-1280.png` | 0 | PASS | Topbar 65px |
| Desktop | `1440×900` | landscape | `crm-theme-1440.png` | 0 | PASS | Header/main axes aligned |
| Full HD / TV | `1920×1080` | landscape | `crm-theme-1920.png` | 0 | PASS | No excessive overflow |
| 4K / TV | `3840×2160` | landscape | automated | 0 | PASS | Shell and content remain visible |

## Container alignment

| Width | Header left/right | Main left/right | Delta | Result |
|---:|---:|---:|---:|---|
| 1280 | `210 / 1280` | `210 / 1280` | 0 | PASS |
| 1440 | `244 / 1440` | `244 / 1440` | 0 | PASS |

## Findings

### RQA-001 — Fixed Blocker — рабочая область была ниже viewport

- Route/state: все разделы в диапазоне старых конфликтующих breakpoint.
- Viewport/browser: `821–980px`, Chrome.
- Evidence: предыдущий аудит и исходный скриншот пользователя.
- Measured symptom: sidebar занимал отдельную строку высотой с viewport, `.main` начинался ниже экрана.
- User consequence: пользователь видел только меню и считал приложение сломанным.
- Likely source: одновременно действовали breakpoint `820/821` новой темы и `980` старой оболочки.
- Required correction: один контракт навигации — mobile до `1100px`, desktop с `1101px`.
- Recheck targets: `820`, `821`, `852`, `979`, `980`, `981`, `1024`, `1099`, `1100`, `1101`.

### RQA-002 — Fixed Major — шапка переполнялась и теряла выравнивание

- Route/state: все основные разделы.
- Viewport/browser: `1101–1381px`, Chrome.
- Evidence: automated shell matrix.
- Measured symptom: элементы расходились по нижней линии до 7px, выход справа до 7px.
- User consequence: шапка выглядела «пляшущей» и могла обрезать кнопку выхода.
- Likely source: жёсткие минимальные ширины восьми grid-колонок.
- Required correction: content-aware columns, скрытие плотности в узком desktop, выравнивание по нижней линии.
- Recheck targets: `1101`, `1180`, `1181`, `1220`, `1221`, `1280`, `1380`, `1381`.

### RQA-003 — Observation — реальный Mac Chrome

- Route/state: основные рабочие экраны.
- Viewport/browser: физический Mac, системный масштаб и шрифтовой рендеринг.
- Evidence: отсутствует в автоматическом прогоне Windows.
- Measured symptom: не выявлен.
- User consequence: возможны небольшие отличия сглаживания и метрик шрифта.
- Likely source: платформенный рендеринг.
- Required correction: ручной просмотр тестовой публикации на Mac.
- Recheck targets: окно около `852px`, затем `1280px` или полноэкранный режим.

### RQA-004 — Fixed Major — парные панели и карточки рабочего стола имели разную высоту

- Route/state: `/today`, роль генерального директора.
- Viewport/browser: `1231×769`, Mac Chrome по снимку владельца и Chrome в автоматическом повторном тесте.
- Evidence: `crm-theme-dashboard-1231.png`.
- Measured symptom: соседние панели заканчивались на разной высоте, повторяющиеся карточки не образовывали общий ритм.
- User consequence: второй экран выглядел случайно собранным и затруднял быстрое сравнение данных.
- Required correction: растягивание парных панелей по строке, сетка `7/5`, компактная двухзонная карточка объекта и одинаковая минимальная высота повторяющихся строк.
- Recheck result: дельта высоты обеих пар панелей `0–1px`, дельта повторяющихся карточек `0–1px`, горизонтальное переполнение `0px`.

## Recheck

- Fixes applied: единый breakpoint, компактная мобильная шапка, системные команды в «Ещё», переносы длинного текста, fallback медиа, русские названия журнала, прямые маршруты, единый ритм парных панелей и карточек рабочего стола.
- Fresh evidence: `docs/qa-reports/evidence/responsive-2026-08-31/`.
- Sweep result: 104 ширины от `320` до `1920` с шагом 16px плюс `2560`, `3440`, `3840`; overflow 0.
- Unresolved items: только ручное платформенное подтверждение на Mac; Blocker и Major отсутствуют.
- External requests: 0.
- Browser console errors приложения: 0.

## Verdict

`READY WITH MINOR FIXES`

Reason: полный эмулированный аудит пройден, Blocker и Major отсутствуют. Осталось ручное подтверждение на реальном Mac, которое не требует нового изменения кода.
Next action: опубликовать тестовую ветку отдельным разрешением и проверить окно Mac около `852px`.
