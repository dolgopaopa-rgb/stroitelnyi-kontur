# Selectel VDS: текущий запуск

Рабочее приложение развернуто на отдельном Selectel VDS.

## Адреса

- Технический HTTPS-адрес: `https://79-143-30-43.sslip.io`
- IP сервера: `79.143.30.43`
- Имя сервера: `d2dom`
- ОС: Ubuntu 22.04 LTS

Адрес `sslip.io` подходит для технического запуска. Для постоянной работы лучше заменить его на собственный домен или поддомен.

## Где лежит проект

```bash
/opt/stroitelnyi-kontur
```

## Запуск и состояние

```bash
cd /opt/stroitelnyi-kontur
docker compose ps
```

## Обновление

```bash
cd /opt/stroitelnyi-kontur
bash deploy/update.sh
```

## Резервные копии

Автоматический бэкап включен через cron:

```text
10 0 * * * cd /opt/stroitelnyi-kontur && bash deploy/backup.sh >> /var/log/stroitelnyi-kontur-backup.log 2>&1
```

По московскому времени это примерно 03:10.

Файлы бэкапов лежат здесь:

```bash
/opt/stroitelnyi-kontur/data/backups
```

## SSH

На сервер добавлен SSH-ключ с локальной машины:

```text
C:\Users\seven\.ssh\stroitelnyi_kontur_selectel_rsa
```

После проверки доступа пароль root лучше сменить в панели Selectel или через SSH.

## Безопасность

Сейчас включена базовая защита логином и паролем на весь сайт. Это временный вариант для MVP. Для полноценной эксплуатации следующим этапом нужна нормальная авторизация пользователей внутри приложения.
