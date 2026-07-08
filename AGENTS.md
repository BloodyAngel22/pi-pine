# Pi Pine — AGENTS.md

## Project Overview

**Pi Pine** — десктоп-клиент (Tauri 2) для AI-кодинг-агента **pi-mono-x** (форк [pi.dev](https://pi.dev)).
Заменяет шумный CLI-вывод pi на компактный UI со сворачиваемыми thinking/tool-call блоками,
встроенным терминалом (xterm.js + portable-pty), управлением сессиями и MCP-серверами.

- **Автор**: maximz
- **Лицензия**: MIT
- **Статус**: alpha / MVP (только Linux amd64)

## Stack

| Слой | Технологии |
|---|---|
| Frontend | TypeScript 5.7, React 18, Vite 6, Tailwind CSS 4, Zustand 5, xterm.js 5 |
| Backend | Rust 2021 edition, Tauri 2, tokio, serde, portable-pty |
| Агент (внешний) | pi-mono-x (`pi --mode rpc` через stdin/stdout, протокол JSONL) |

## Architecture

```
React UI (Vite + Tailwind + Zustand + xterm.js)
  ↕  invoke / listen  (@tauri-apps/api)
Tauri (Rust): rpc.rs · terminal.rs · paths.rs · sessions.rs · plans.rs · mcp.rs · themes.rs
  ↕  stdin/stdout JSONL           ↕  portable-pty
pi --mode rpc  (pi-mono-x)                 shell (bash/zsh)
  ↕
~/.pi/agent/{auth,settings,sessions,mcp-config}.*
```

## Key Modules

### Rust (src-tauri/src/)

| Модуль | Назначение |
|---|---|
| `lib.rs` | Точка входа, регистрация Tauri-команд |
| `rpc.rs` | Спавн `pi --mode rpc`, JSONL-парсер, события `rpc://line/stderr/closed` |
| `terminal.rs` | PTY-терминал через portable-pty |
| `paths.rs` | Поиск бинарника pi, автодополнение, auth.json watcher |
| `sessions.rs` | Список/переименование/удаление/обрезка .jsonl сессий |
| `plans.rs` | Режим плана (.pi/plans/) |
| `mcp.rs` | Чтение/редактирование mcp-config.json |
| `themes.rs` | Цветовые темы |
| `favorites.rs` | Избранные модели/провайдеры |
| `clipboard.rs` | Буфер обмена |
| `virtual_display.rs` | Изолированный Xvfb-дисплей |
| `analyze_image.rs` | OCR/Analyze image |

### Frontend (src/)

| Модуль | Назначение |
|---|---|
| `main.tsx` | Точка входа React |
| `App.tsx` | Корневой компонент (компоновка панелей) |
| `rpc/bridge.ts` | Типизированный JSONL-RPC мост (Tauri invoke → pi) |
| `rpc/types.ts` | Типы протокола pi --mode rpc |
| `store/chat.ts` | Zustand: стриминг, форк, регенерация, cwd-команды |
| `store/ext.ts` | Zustand: MCP-расширения |
| `store/models.ts` | Zustand: модели/провайдеры |
| `store/theme.ts` | Zustand: темы |
| `terminal.ts` | xterm.js с Tauri invoke-мостом |
| `i18n/ru.ts` | Русская локализация |
| `components/` | React-компоненты: Chat, Terminal, Settings, SidePanel... |

## Build & Run

```bash
# dev (горячая перезагрузка)
npm run tauri:dev

# сборка релиза
npm run tauri:build

# быстрая сборка без бандлов
npx tauri build --no-bundle

# проверка типов TypeScript
npm run check

# запуск готового бинаря в проекте
./src-tauri/target/release/pi-pine .
```

**Важно**: GUI (десктоп-окно Tauri) тестирует сам пользователь вручную. Не запускай
`tauri:dev`/`tauri:build`/готовый бинарь и не веди UI через Xvfb/xdotool/скриншоты —
после того как код проходит `npm run check` (TS) и `cargo check`/`cargo build`,
считай верификацию завершённой и оставляй ручное тестирование в приложении
пользователю.

## Working with pi-mono-x

Если в ходе работы потребовалось править код pi-mono-x (например, расширять RPC-протокол):

1. Репозиторий: `/home/maximz/programming/pi-mono-x`
2. После внесения всех правок **обязательно** запустить проверку:

   ```bash
   cd /home/maximz/programming/pi-mono-x
   npm run check
   ```

   `npm run check` в pi-mono-x прогоняет **biome** — линтер и форматтер для TypeScript.
   Это единая команда: `biome check --write .` (линтер) + `tsc --noEmit` (type checker).
   Все предупреждения biome должны быть исправлены, иначе PR не принимается.

3. После успешной проверки — пересобрать pi-mono-x:

   ```bash
   npm run build
   ```

4. Перезапустить pi-pine (или перезапустить RPC-сессию), чтобы изменения вступили в силу.

## RPC Protocol (pi --mode rpc)

Pi Pine общается с pi-mono-x через **JSONL RPC** (одна JSON-строчка на строку, LF-разделитель).

- Команды: `prompt`, `steer`, `follow_up`, `btw`, `bash`, `abort`, `get_state`, `get_messages`, `compact`, `switch_session`, `navigate_tree`, `fork`, `cd`, `pwd`, `ls`, `set_model`, `cycle_model`, `set_thinking_level`, `set_steering_mode`, `set_follow_up_mode`, `set_auto_compaction`, `set_auto_retry`, и др.
- События: `message_update`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `turn_end`, `extension_ui_request`
- Extension UI: `permission`, `confirm`, `select`, `input`, `notify`, `editor`, `setStatus`, `setWidget`
- Источник истины протокола: `packages/coding-agent/docs/rpc.md` в pi-mono-x
- **Важно**: Pi Pine НЕ совместим с оригинальным pi.dev — требуется pi-mono-x, ветка `feature/pi-pine-rpc-integration` (см. раздел «Working with pi-mono-x»)

## Code Style

### TypeScript
- **Типизация**: строгая; все RPC-типы в `src/rpc/types.ts`
- **Стейт-менеджмент**: Zustand (не Redux, не Context) — см. `src/store/`
- **Стиль**: ES modules (`type: "module"` в package.json)
- **Импорты**: абсолютные (@tauri-apps/*) и относительные (./components/*)
- **Комментарии**: русские для описания логики, английские для API-документации

### Rust
- **Стиль**: стандартный rustfmt
- **Обработка ошибок**: anyhow + Tauri команды возвращают `Result<T, String>`
- **Асинхронность**: tokio (`#[tokio::main]` для команд, `tokio::spawn` для фоновых задач)
- **JSON**: serde + serde_json во всех RPC-структурах
- **Tauri-команды**: регистрируются в `lib.rs` → `generate_handler![]`

### CSS
- **Tailwind CSS 4** (import from `styles.css`)
- **Кастомные стили**: в `styles.css` (глобальные) или Tailwind-утилиты в компонентах
- **Темы**: CSS-переменные, загружаемые из toml-файлов (см. `src/themes/`)

### Conventions
- Имена файлов: kebab-case (`rpc/bridge.ts`)
- React-компоненты: PascalCase (`Chat.tsx`, `SidePanel.tsx`)
- Zustand-сторы: camelCase, экспорт хука `useXxxStore`
- Tauri-команды: snake_case (Rust), camelCase (TypeScript invoke)
- Сообщения коммитов: на русском или английском, кратко

## Boundaries (What NOT to Touch)

| Область | Правило |
|---|---|
| `~/.pi/agent/` | Runtime-данные агента — не удалять/перезаписывать без необходимости |
| `node_modules/` | Не коммитить и не редактировать вручную |
| `src-tauri/target/` | Сборочные артефакты — не коммитить |
| `.serena/cache/` | Кеш IDE-агента Serena — не редактировать |
| `dist/` | Сборка фронтенда — не коммитить |

## Dependencies

| Источник | Как установить |
|---|---|
| pi-mono-x | `git clone --branch feature/pi-pine-rpc-integration <repo> && npm install && npm run build` |
| Rust (stable) | rustup |
| libwebkit2gtk-4.1-dev | `sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev` |
| Node.js ≥ 22 | nvm / volta / fnm |

## State Architecture (Zustand Stores)

| Store | Файл | Назначение |
|---|---|---|
| `chat` | `store/chat.ts` | Сообщения, стриминг, форк, регенерация, cwd |
| `ext` | `store/ext.ts` | MCP-расширения, статусы |
| `models` | `store/models.ts` | Доступные модели/провайдеры |
| `theme` | `store/theme.ts` | Тема оформления |
| `sessions` | ~~`store/sessions.ts`~~ | Через RPC `list_project_sessions` |
| `settings` | `store/settings.ts` | Настройки приложения |

## MCP Config Format

Pi Pine читает `~/.pi/agent/mcp-config.json` для управления MCP-серверами.
Пример структуры (Rust → serde_json):

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"],
      "disabled": false
    }
  }
}
```

Поля: `command`, `args`, `env` (опц.), `disabled` (опц., по умолч. false).

## Session Storage

Сессии хранятся как `.jsonl`-файлы:
`~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`

Кодирование cwd: `/home/user/foo` → `--home-user-foo--`
(совместимо с pi CLI).

## Pi Binary Discovery

Порядок поиска бинарника `pi`:
1. `PATH` (через `which pi`)
2. `~/.nvm/` (nvm)
3. `~/.volta/` (volta)
4. `~/.local/share/fnm/` (fnm)
5. Путь из настроек (⚙ → Путь к pi)

```rust
// paths.rs — find_pi_binary()
// 1. which::which("pi")
// 2. Поиск в ~/.nvm/versions/node/*/bin/pi
// 3. ~/.volta/bin/pi
// 4. ~/.local/share/fnm/*/bin/pi
```
