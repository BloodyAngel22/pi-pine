import { memo } from "react";
import clsx from "clsx";
import type { UiMessage } from "@/store/chat";
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

function PlainText({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</div>;
}

function renderTextWithSkills(text: string, key: number, light: boolean) {
  const segs = parseSkillSegments(text);
  if (segs.length === 1 && segs[0].kind === "text") {
    return (
      <div key={key}>
        {light ? <PlainText text={segs[0].text} /> : <Markdown text={segs[0].text} />}
      </div>
    );
  }
  return (
    <div key={key} className="space-y-1">
      {segs.map((s, j) =>
        s.kind === "text" ? (
          <div key={j}>
            {light ? <PlainText text={s.text} /> : <Markdown text={s.text} />}
          </div>
        ) : (
          <SkillBlock key={j} name={s.name} body={s.body} />
        ),
      )}
    </div>
  );
}

function MessageComponent({ message, onCopy, onFork, onRegenerate, onEdit }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const lightTextRender = message.streaming && message.role === "assistant";
  const blocks = message.blocks.map((b, i) => {
    if (b.kind === "text") {
      return renderTextWithSkills(b.text, i, lightTextRender);
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
      </div>

      {isUser ? (
        <div className="pi-bubble-user space-y-1">{blocks}</div>
      ) : (
        <div className={clsx("pi-assistant-divider space-y-1", isSystem && "italic text-(--color-fg-mute)")}>
          {blocks}
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
