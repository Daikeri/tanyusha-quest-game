# Iteration Snapshot

Date: 2026-11-25
Time: 20:57
Title: firebase-voting-and-pages

## Goal

Подключить телефоны к голосованию по QR и подготовить публикацию игры на GitHub Pages.

## What Was Done

- Добавлены сессии Realtime Database, вход ведущего, анонимный вход участников, генерация QR и мобильная страница.
- Добавлены правила доступа и транзакция, которая закрывает опрос и фиксирует итог.
- Сохранена локальная репетиция. При запуске ведущим с loopback QR ведёт на публичный адрес.
- Добавлен workflow публикации игровых файлов из `main`.
- Пройдены 13 проверок движка, обе ветки локальной игры в Edge и сетевой сценарий с двумя участниками на эмуляторе Firebase.

## What Did NOT Work

- При пустом локальном кеше транзакция закрытия завершалась до обращения к серверу. Исправлено, повторная проверка конкурентного закрытия прошла.
- Публичный URL страницы участника пока возвращает 404. Код и настройки подготовлены, публикация Pages и правил в облачном Firebase не выполнялась.

## Files Changed

- `index.html`, `join.html`, `network.css`, `src/`, `tests/network_check.py`
- `database.rules.json`, `firebase.json`, `.firebaserc`, `.github/workflows/pages.yml`
- `README.md`, `docs/architecture/`, `snapshot/INDEX.md`

## Architecture Docs Updated

- `docs/architecture/core.md`
- `docs/architecture/current-state.md`
- `docs/architecture/decisions/20261125-04-firebase-voting.md`
- `docs/architecture/decisions/20261125-05-github-pages.md`

## Next Possible Steps

Опубликовать страницы и правила Firebase. Создать пробную сессию с опубликованной страницы и проверить подключение телефона по QR.
