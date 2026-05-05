# Постоянный сервер

Этот вариант нужен для рабочей ссылки, которую можно отправлять коллегам. Код остается в GitHub, сервер и данные принадлежат владельцу компании.

## Что входит

- `Dockerfile` - собирает приложение в контейнер.
- `docker-compose.yml` - запускает приложение и Caddy.
- `deploy/Caddyfile` - принимает HTTPS-запросы и передает их приложению.
- Docker volume `app_data` - хранит SQLite-базу вне контейнера, чтобы данные не пропадали при обновлении приложения.
- Базовый логин и пароль через `APP_BASIC_AUTH_USER` и `APP_BASIC_AUTH_PASSWORD`.

## Какой сервер нужен

Для первой постоянной версии достаточно VPS:

- 1-2 vCPU;
- 1-2 GB RAM;
- 20-40 GB SSD;
- Ubuntu 22.04 или 24.04;
- открытые порты `80` и `443`;
- домен или поддомен, например `kontur.company.ru`.

## Первичная настройка

На сервере должны быть установлены Docker и Docker Compose.

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
```

3. Запустить:

```bash
docker compose up -d --build
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

## Резервная копия базы

Создать копию вручную:

```bash
docker compose exec app python app/backup_sqlite.py
```

Файлы резервных копий будут лежать внутри volume рядом с базой, в папке `backups`.

Для ежедневной копии можно добавить cron на сервере:

```bash
0 3 * * * cd /path/to/stroitelnyi-kontur && docker compose exec -T app python app/backup_sqlite.py
```

## Важное ограничение текущей версии

Сейчас это постоянная серверная упаковка для MVP, но база пока SQLite. Для небольшой команды и проверки рабочих процессов этого достаточно. Для полноценной эксплуатации следующим шагом нужно перейти на PostgreSQL, чтобы получить более надежную работу с несколькими пользователями, резервное копирование и восстановление на уровне базы.
