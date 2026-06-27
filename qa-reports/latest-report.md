# QA Fix Report

## Общий статус

✅ OK

- generatedAt: 2026-06-27T11:13:56.370Z
- commitHash: faea1cf
- production deploy: не выполнялся

## Что было проверено

- структура QA-директорий
- наличие npm-скриптов QA
- существующий qa-artifacts/latest отчёт
- правила безопасных и опасных изменений
- static lint без перезаписи qa-artifacts/latest

## Что было найдено

- Критических проблем не найдено на выполненном наборе проверок.

## Что исправлено автоматически

- Скопирован актуальный qa-artifacts/latest/qa-report.md в qa-reports/latest-report.md
- Скопирован актуальный qa-artifacts/latest/qa-report.json в qa-reports/latest-report.json

## Что требует подтверждения владельца

- Опасных изменений не требуется.

## Что осталось проверить вручную

- Для полного цикла запустить `npm run qa` или `node tools/qa/qa-fix-orchestrator.mjs --fix --full`.

## Запущенные команды

- `C:\Users\seven\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools/qa/static-lint.mjs` → exit 0, 0.8s

## Как запустить проверку

```bash
npm run qa
npm run qa:e2e
npm run qa:snapshots
npm run qa:report
```

## Агентная модель

- Lead QA Fix Architect: проверки — координация проверок, разделение safe/dangerous, итоговый отчёт; safe-fix — создание QA-директорий, синхронизация отчётов, запуск quality gate
- Code Review Fix Agent: проверки — lint, typecheck, мелкие ошибки кода; safe-fix — неиспользуемые импорты, очевидные null/undefined guards, мелкие ошибки импортов
- Frontend QA Fix Agent: проверки — страницы, кнопки, формы, модалки, адаптивность; safe-fix — битые обработчики, внутренние ссылки, модалки, горизонтальный скролл
- UI Consistency Fix Agent: проверки — кнопки, карточки, формы, отступы, disabled/hover; safe-fix — размеры однотипных элементов, отступы, радиусы, состояния форм
- UX Fix Agent: проверки — подписи, loading/error/success, empty states, кликабельные зоны; safe-fix — понятные подписи, состояния загрузки, пустые состояния
- Regression Fix Agent: проверки — auth, объекты, задачи, материалы, документы, мобильная версия; safe-fix — локализация файла регрессии, точечный frontend-fix
- Playwright E2E Agent: проверки — smoke, navigation, forms, mobile, screenshots; safe-fix — стабильные selectors, test fixtures, mock/e2e режим без реальных данных
- Accessibility Fix Agent: проверки — labels, aria, focus-visible, contrast, tab order; safe-fix — aria-label, alt, focus styles, input labels
- Performance Fix Agent: проверки — тяжёлые импорты, лишний код, lazy loading, шрифты; safe-fix — простые lazy/defer правки, удаление очевидно неиспользуемого UI-кода
- Security Check Agent: проверки — secrets, console.log sensitive data, target blank, XSS UI risk; safe-fix — rel=noopener noreferrer, убрать чувствительный console.log, безопасный текст ошибок
- Visual Snapshot Agent: проверки — 390x844, 768x1024, 1280x720, 1440x900, 1920x1080; safe-fix — фиксация screenshots, поиск белого экрана и сломанной вёрстки

## Запрещено без подтверждения

- База данных и схема таблиц
- Авторизация и сессии
- Роли и права пользователей
- API-контракты
- Деплой, домены и production-публикация
- Токены, ключи и секреты
- Удаление крупных разделов или бизнес-логики
