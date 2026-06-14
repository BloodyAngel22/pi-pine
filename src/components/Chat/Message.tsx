import { memo } from "react";
import clsx from "clsx";
import type { UiBlock, UiBlockTool, UiMessage } from "@/store/chat";
import { Markdown } from "./Markdown";
import { ToolCall } from "./ToolCall";
import { ThinkingBlock } from "./ThinkingBlock";
import { SkillBlock } from "./SkillBlock";
import { ActionBar } from "./ActionBar";

interface Props {
  message: UiMessage;
  onCopy(text: string): void;
  onFork?(message: UiMessage): void;
  onRegenerate?(message: UiMessage): void;
  onEdit?(message: UiMessage, text: string): void;
}

type Segment =
  | { kind: "text"; text: string }
  | { kind: "skill"; name: string; body: string };

/**
 * Разбивает сырой текст сообщения на сегменты: обычный текст и блоки
 * скиллов. pi инлайнит вызов `/skill:NAME` в виде XML-тега
 * `<skill name="NAME" location="/path/SKILL.md">…тело…</skill>`,
 * который мы и ловим. Дополнительно поддерживаем «голый» токен
 * `/skill:NAME` (на случай если pi когда-то изменит формат).
 */
function parseSkillSegments(text: string): Segment[] {
  type Match = { start: number; end: number; name: string; body: string };
  const matches: Match[] = [];

  // 1) <skill name="..." [location="..."]>…</skill> (многострочное)
  const xmlRe = /<skill\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/skill>/g;
  let m: RegExpExecArray | null;
  while ((m = xmlRe.exec(text)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      name: m[1],
      body: m[2].replace(/^[\s\n]+|[\s\n]+$/g, ""),
    });
  }

  // 2) Голые токены `/skill:NAME` (без XML-обёртки)
  const tokenRe = /\/skill:([\w.-]+)/g;
  while ((m = tokenRe.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    // Пропускаем, если этот токен уже внутри XML-блока
    if (matches.some((x) => start >= x.start && end <= x.end)) continue;
    matches.push({ start, end, name: m[1], body: "" });
  }

  if (matches.length === 0) return [{ kind: "text", text }];

  // Сортировка по позиции и сборка сегментов
  matches.sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cursor = 0;
  for (const mm of matches) {
    if (mm.start > cursor) {
      const chunk = text.slice(cursor, mm.start).replace(/^[\s\n]+|[\s\n]+$/g, "");
      if (chunk) out.push({ kind: "text", text: chunk });
    }
    out.push({ kind: "skill", name: mm.name, body: mm.body });
    cursor = mm.end;
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor).replace(/^[\s\n]+|[\s\n]+$/g, "");
    if (tail) out.push({ kind: "text", text: tail });
  }
  return out;
}

function renderTextWithSkills(text: string, key: number) {
  const segs = parseSkillSegments(text);
  if (segs.length === 1 && segs[0].kind === "text") {
    return (
      <div key={key}>
        <Markdown text={segs[0].text} />
      </div>
    );
  }
  return (
    <div key={key} className="space-y-1">
      {segs.map((s, j) =>
        s.kind === "text" ? (
          <div key={j}>
            <Markdown text={s.text} />
          </div>
        ) : (
          <SkillBlock key={j} name={s.name} body={s.body} />
        ),
      )}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toolPath(input: unknown): string | undefined {
  const record = asRecord(input);
  for (const key of ["path", "file_path", "filePath", "filename"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return undefined;
}

function pendingPermissionToolName(block: UiBlockTool): string | undefined {
  const input = asRecord(block.input);
  return typeof input.permissionToolName === "string" ? input.permissionToolName : block.name;
}

function pendingPermissionPath(block: UiBlockTool): string | undefined {
  const input = asRecord(block.input);
  const argsPath = toolPath(input.permissionToolArgs);
  if (argsPath) return argsPath;
  return typeof input.permissionValue === "string" ? input.permissionValue : undefined;
}

function shouldHideRunningToolBehindPermission(block: UiBlock, allBlocks: UiBlock[]): boolean {
  if (block.kind !== "tool" || block.status !== "running") return false;
  const blockPath = toolPath(block.input);
  return allBlocks.some((other) => {
    if (other.kind !== "tool" || other.status !== "pending") return false;
    const input = asRecord(other.input);
    if (input.permissionType !== "file") return false;
    if (pendingPermissionToolName(other) !== block.name) return false;
    const permPath = pendingPermissionPath(other);
    // If both paths are known, only hide the exact duplicate. If paths are not
    // available, fall back to tool name: this is render-only and does not affect
    // permission ids/lifecycle.
    return blockPath && permPath ? blockPath === permPath : true;
  });
}

function MessageComponent({ message, onCopy, onFork, onRegenerate, onEdit }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const visibleBlocks = message.blocks.filter((b) => !shouldHideRunningToolBehindPermission(b, message.blocks));
  const blocks = visibleBlocks.map((b, i) => {
    if (b.kind === "text") {
      return renderTextWithSkills(b.text, i);
    }
    if (b.kind === "thinking") return <ThinkingBlock key={i} text={b.text} />;
    if (b.kind === "tool") return <ToolCall key={i} block={b} />;
    if (b.kind === "image") {
      return (
        <img
          key={i}
          src={`data:${b.mimeType};base64,${b.data}`}
          alt=""
          className="max-h-72 rounded-md border border-(--color-border)"
        />
      );
    }
    return null;
  });

  return (
    <div className="pi-stream-msg group">
      <div className="flex items-center gap-2 mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-(--color-fg-mute)">
        {isUser ? (
          <span className="text-(--color-accent)">Вы</span>
        ) : isSystem ? (
          <span>Система</span>
        ) : (
          <span>pi</span>
        )}
        {message.streaming && (
          <span className="text-(--color-fg-dim) normal-case font-normal lowercase">
            • стримит…
          </span>
        )}
        {message.optimistic && (
          <span className="text-(--color-fg-dim) normal-case font-normal lowercase">
            • отправлено…
          </span>
        )}
        {message.error && (
          <span className="text-(--color-danger) normal-case font-normal lowercase">
            • ошибка отправки
          </span>
        )}
      </div>

      {isUser ? (
        <div className="pi-bubble-user space-y-1">{blocks}</div>
      ) : (
        <div className={clsx("pi-assistant-divider space-y-1", isSystem && "italic text-(--color-fg-mute)")}>
          {blocks}
          {message.pendingAssistant && message.blocks.length === 0 && (
            <div className="inline-flex items-center gap-2 text-sm text-(--color-fg-mute)">
              <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent) animate-pulse" />
              <span>pi думает…</span>
            </div>
          )}
          {message.streaming && message.blocks.length === 0 && (
            <span className="pi-cursor" />
          )}
        </div>
      )}

      <ActionBar
        message={message}
        onCopy={onCopy}
        onFork={onFork ? () => onFork(message) : undefined}
        onRegenerate={onRegenerate && !isUser ? () => onRegenerate(message) : undefined}
        onEdit={onEdit && isUser ? (text) => onEdit(message, text) : undefined}
      />
    </div>
  );
}

export const Message = memo(MessageComponent);
