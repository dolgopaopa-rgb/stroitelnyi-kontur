# Постоянный сервер

Этот вариант нужен для рабочей ссылки, которую можно отправлять коллегам. Код остается в GitHub, сервер и данные принадлежат владельцу компании.

## Что входит

- `Dockerfile` - собирает приложение в контейнер.
- `docker-compose.yml` - запускает приложение и Caddy.
- `deploy/Caddyfile` - принимает HTTPS-запросы и передает их приложению.
- Docker volume `app_data` - хранит SQLite-базу вне контейнера, чтобы данные не пропадали при обновлении приложения.
- Вход через страницу приложения с cookie-сессией. Аккаунты берутся из `APP_ACCESS_ACCOUNTS`; старые `APP_BASIC_AUTH_USER` и `APP_BASIC_AUTH_PASSWORD` остаются запасным админским входом.

## Какой сервер нужен

Для первой постоянной версии достаточно VPS:

- 1-2 vCPU;
- 1-2 GB RAM;
- 20-40 GB SSD;
- Ubuntu 22.04 или 24.04;
- открытые порты `80` и `443`;
- домен или поддомен, например `kontur.company.ru`.

## Первичная настройка

На сервере должны быть установлены Docker и Docker Compose. Если сервер чистый Ubuntu, можно установить их так:

```bash
bash deploy/install-docker-ubuntu.sh
```

После установки нужно выйти из SSH и зайти заново, чтобы группа `docker` применилась к пользователю.

1. Склонировать репозиторий:

```bash
git clone https://github.com/dolgopaopa-rgb/stroitelnyi-kontur.git
cd stroitelnyi-kontur
```

2. Создать файл настроек:

```bash
cp .env.example .env
nano .env
```

В `.env` указать:

```text
DOMAIN=kontur.company.ru
APP_BASIC_AUTH_USER=admin
APP_BASIC_AUTH_PASSWORD=long-random-password
APP_ACCESS_ACCOUNTS=director|long-random-password|1|owner|1;alexey|long-random-password|3|sales_manager|0
APP_SESSION_SECRET=long-random-session-secret
```

3. Запустить:

```bash
bash deploy/first-run.sh
```

4. Проверить:

```bash
docker compose ps
docker compose logs -f app
```

После запуска Caddy сам выпустит HTTPS-сертификат для домена, если DNS уже смотрит на IP сервера.

## Обновление приложения

```bash
git pull
docker compose up -d --build
```

База остается в Docker volume `app_data`.

Или коротко:

```bash
bash deploy/update.sh
```

## Резервная копия базы

Создать копию вручную:

```bash
bash deploy/backup.sh
```

Файлы резервных копий будут лежать на сервере в папке `data/backups`.

По умолчанию автоматическая уборка бэкапов оставляет:

- базы данных `construction-*.db` за 30 дней;
- архивы загруженных файлов `uploads-*.zip` за 10 дней;
- минимум 3 последних файла каждого типа, даже если они старше срока хранения.

Сроки можно переопределить переменными окружения:

```bash
DB_BACKUP_KEEP_DAYS=30
UPLOAD_BACKUP_KEEP_DAYS=10
BACKUP_KEEP_MIN=3
```

Это нужно, чтобы большой каталог резервных копий uploads не заполнял весь production-диск.

Для ежедневной копии можно добавить cron на сервере:

```bash
0 3 * * * cd /path/to/stroitelnyi-kontur && bash deploy/backup.sh
```

## Восстановление базы из копии

Восстановление заменяет текущую базу. Скрипт специально требует подтверждение, чтобы случайно не затереть рабочие данные.

```bash
RESTORE_CONFIRM=yes bash deploy/restore-sqlite.sh data/backups/construction-YYYYMMDD-HHMMSS.db
```

Перед заменой текущая база сохраняется внутри Docker volume с именем вида `construction.db.before-restore-...`.

## Перенос текущей базы с компьютера на сервер

Если нужно перенести локальные тестовые данные с твоего компьютера:

1. На Windows запустить:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\export-local-db.ps1
```

2. Полученный файл из `data/backups` загрузить на сервер в папку `data/backups`.

3. На сервере выполнить восстановление:

```bash
RESTORE_CONFIRM=yes bash deploy/restore-sqlite.sh data/backups/local-export-YYYYMMDD-HHMMSS.db
```

Если переносить тестовые данные не нужно, этот раздел можно пропустить: на сервере приложение само создаст чистую базу при первом запуске.

## DNS и ссылка для коллег

Чтобы коллеги открывали приложение по нормальному адресу:

1. Купить или использовать существующий домен.
2. Создать DNS-запись типа `A`: например `kontur.company.ru -> IP сервера`.
3. В `.env` указать этот домен в строке `DOMAIN=kontur.company.ru`.
4. Запустить `bash deploy/first-run.sh`.

Когда DNS уже смотрит на сервер, Caddy автоматически выпустит HTTPS-сертификат. После этого коллегам можно отправлять ссылку вида:

```text
https://kontur.company.ru
```

## Важное ограничение текущей версии

Сейчас это постоянная серверная упаковка для MVP, но база пока SQLite. Для небольшой команды и проверки рабочих процессов этого достаточно. Для полноценной эксплуатации следующим шагом нужно перейти на PostgreSQL, чтобы получить более надежную работу с несколькими пользователями, резервное копирование и восстановление на уровне базы.
