<p align="center">
    <img src="assets/logo.png" alt="Pi Pine" width="280" />
</p>

<h1 align="center">Pi Pine</h1>

<p align="center">
    Минималистичный десктоп-фронтенд для <a href="https://pi.dev/">pi</a> — AI-кодинг-агента от mariozechner.<br/>
    Pi запускается как CLI и выводит в консоль огромный поток информации: thinking-блоки, tool-calls,
    статусы MCP — всё это смешивается в сплошной поток текста, которым неудобно пользоваться.
    Pi Pine решает именно эту проблему: это тонкая обёртка вокруг <code>pi --mode rpc</code>,
    которая убирает шум CLI и даёт чистый однооконный диалог с агентом.
</p>

> **Стек**: Tauri 2 · Rust · React 18 · TypeScript · Vite · Tailwind CSS 4 · Zustand  
> **Статус**: alpha / MVP

## Чем отличается от pi CLI

| | pi CLI | Pi Pine |
|---|---|---|
| Интерфейс | Терминал | Нативный десктоп (Tauri, ~6 МБ) |
| Вывод thinking / tool-calls | Сырой поток в консоль | Компактные сворачиваемые блоки |
| Навигация по сессиям | Флаги и файлы вручную | Сайдбар, переименование, удаление |
| Форк / регенерация / редактура | Нет | Встроено в UI каждого сообщения |
| MCP-статусы | Смешаны с выводом агента | Отдельная статус-строка |

## Возможности

- Потоковый чат с автосклейкой `message_update`-дельт.
- **Thinking-блоки** и **tool-calls** — свёрнуты по умолчанию, разворачиваются по клику.
- **Сайдбар сессий** — переключение, переименование, удаление сессий из `~/.pi/agent/sessions/`.
- **Регенерировать** — откатывает сессию до родительского запроса и повторяет его в текущей сессии.
- **Форк** — создаёт новую ветку сессии от выбранного сообщения и переключается в неё.
- **Редактировать** — откатывает сессию до выбранного запроса и подставляет текст в поле ввода.
- **Выбор модели и провайдера** из `get_available_models` с поиском.
- **Thinking level**: off → minimal → low → medium → high → xhigh.
- **Slash-палитра**: `/new`, `/sessions`, `/model`, `/compact`, `/settings`, `/abort`.
- **Палитра скиллов** — выбор `/skill:name` из установленных скиллов pi.
- **Режим плана** — ограничивает агента markdown-файлом плана, запускается кнопкой «Реализуй».
- **Режим очереди** — направляет или добавляет запрос пока агент ещё отвечает.
- **Панель команд** — запуск shell-команд из интерфейса.
- **Управление MCP** — вкладка в настройках (⚙ → MCP): список серверов, включение/отключение, перезапуск.
- **Отслеживание** `auth.json` — автообновление при входе/выходе из pi без перезапуска.
- Markdown с подсветкой кода, нормализация вывода модели (плотные списки, emoji-секции).
- Компактный **статус-бар**: cwd · модель · токены · стоимость · расширения.
- **Запуск с cwd-аргументом**: `pi-pine .` / `pi-pine ~/myproject`.
- Карточка первого запуска, если `pi` не найден; ручное указание пути в настройках.

## Известные ограничения

- Только Linux (webkit2gtk). macOS/Windows — в планах.
- Protocol Extension UI (`ctx.ui.notify/select/confirm/...`) — частичная поддержка.
- Нет встроенного терминала, дерева файлов, просмотра diff.
- Несколько панелей сессий одновременно — не реализовано.

## Требования

- **[pi](https://pi.dev/)**: `npm i -g @mariozechner/pi-coding-agent`  
  Pi Pine ищет бинарь в `PATH`, `~/.nvm/`, `~/.volta/`, `~/.local/share/fnm/`.
  Если не нашёл — укажите вручную в настройках (⚙).
- **Node.js ≥ 22** и **Rust** (stable) — для сборки из исходников.
- **Linux**: `libwebkit2gtk-4.1-0`, `librsvg2-2`.

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev
```

## Запуск из исходников

```bash
git clone <repo> pi-pine
cd pi-pine
npm install
npm run tauri:dev          # dev-сервер с горячей перезагрузкой
```

### Запуск в конкретном проекте

```bash
# открыть в текущей директории
./src-tauri/target/debug/pi-pine .

# или передать путь явно
./src-tauri/target/debug/pi-pine ~/projects/myapp
```

## Сборка

```bash
npm run tauri:build
# Артефакты:
#   src-tauri/target/release/pi-pine                     — ELF-бинарь
#   src-tauri/target/release/bundle/deb/*.deb             — .deb (Debian/Ubuntu)
#   src-tauri/target/release/bundle/appimage/*.AppImage   — AppImage
```

Без бандлов (быстрее):

```bash
npx tauri build --no-bundle
./src-tauri/target/release/pi-pine
```

## Горячие клавиши

| Клавиша | Действие |
|---|---|
| `Ctrl+B` | Сайдбар сессий |
| `Ctrl+,` | Настройки |
| `Ctrl+N` | Новая сессия |
| `Enter` | Отправить сообщение |
| `Shift+Enter` | Перенос строки |
| `↑` / `↓` | История ввода (когда поле пустое) |
| `Esc` | Прервать стриминг |
| `Tab` | Автодополнение в slash-палитре |

## Архитектура

```
React UI (Vite + Tailwind + Zustand)
  ↕  invoke / listen   (@tauri-apps/api)
Tauri (Rust): rpc.rs · paths.rs · sessions.rs · plans.rs · mcp.rs
  ↕  stdin/stdout (JSONL, LF only)
pi --mode rpc  (@mariozechner/pi-coding-agent)
  ↕
~/.pi/agent/{auth,settings,sessions,extensions,mcp-config}.*
```

- **`src-tauri/src/rpc.rs`** — спавн `pi --mode rpc`, JSONL-парсер, очистка ANSI, события `rpc://line/stderr/closed`.
- **`src-tauri/src/paths.rs`** — поиск бинарника `pi`, чтение `auth.json`, отслеживание изменений.
- **`src-tauri/src/sessions.rs`** — список, переименование, удаление, обрезка `*.jsonl`-файлов сессий.
- **`src-tauri/src/plans.rs`** — режим плана: markdown-файлы в `<cwd>/.pi/plans/`.
- **`src-tauri/src/mcp.rs`** — чтение и редактирование `mcp-config.json`: список серверов, включение/отключение.
- **`src/rpc/bridge.ts`** — типизированный RPC с сопоставлением запрос/ответ по `id`.
- **`src/store/chat.ts`** — Zustand: события pi → UI-блоки, форк/регенерация/редактирование через `navigate_tree`, баннер ветки.

## Где хранятся данные pi

- `~/.pi/agent/auth.json` — токены провайдеров (чтение + отслеживание).
- `~/.pi/agent/settings.json` — настройки CLI (чтение/запись через настройки).
- `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl` — сессии (чтение/запись/удаление).
- `~/.pi/agent/mcp-config.json` — конфигурация MCP-серверов (чтение/запись через ⚙ → MCP).
- `~/.pi/agent/extensions/mcp/` — расширение pi, реализующее подключение MCP-серверов.
- `<cwd>/.pi/plans/` — файлы планов (чтение/запись).

Кодирование cwd: `/home/user/foo` → `--home-user-foo--` (совместимо с pi CLI).

## Устранение проблем

**`pi` не найден при запуске**  
→ Установите: `npm i -g @mariozechner/pi-coding-agent`  
→ Или укажите путь вручную в настройках (⚙ → «Путь к pi»).

**Ошибка webkit/librsvg при сборке**  
→ `sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev`

**Сессии не отображаются в сайдбаре**  
→ Проверьте, что cwd совпадает с тем, где создавались сессии.  
→ Pi хранит сессии в `~/.pi/agent/sessions/<encoded-cwd>/`.

**MCP не инициализируется / зависает**  
→ Проверьте конфиг MCP в настройках (⚙ → MCP).  
→ Попробуйте «Безопасный режим» (кнопка в баннере ошибки).

## Лицензия

MIT — см. [LICENSE](LICENSE).
