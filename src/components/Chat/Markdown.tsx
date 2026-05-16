import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { open } from "@tauri-apps/plugin-shell";

interface Props {
  text: string;
}

// Эмодзи в начале строки (включая многосоставные с ZWJ/Variation Selector)
// Используется, чтобы превращать «цепочки» псевдо-пунктов вида
//   🔐 Шифрование...
//
//   🔑 Многоключевой...
// в нормальный список (один <ul>), а не в отдельные параграфы с margin'ами.
const EMOJI_LEAD =
  /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}](?:\uFE0F|\u200D[\p{Extended_Pictographic}])*\s+/u;

// Уже готовый markdown-блок (содержит список / pre / heading и т.п.) — не трогаем.
const SKIP_GROUPING = /^(?:[-*+] |\d+\. |#{1,6} |> |```|\||    )/;
// Строго list-item.
const LIST_ITEM = /^(?:[-*+] |\d+\. )/;
// Однострочный «заголовок секции:» — LLM часто после него отдаёт
// псевдо-список отдельными абзацами без markdown-маркеров.
const COLON_SECTION = /^[^\n]{2,80}:$/;

function isSingleLine(b: string) {
  return !b.includes("\n");
}
function isEmojiLed(b: string) {
  return EMOJI_LEAD.test(b);
}

/**
 * Нормализация LLM-markdown:
 *
 *   • схлопываем 3+ переводов строк → `\n\n`;
 *   • emoji-led однострочный блок, после которого идут другие
 *     однострочные блоки, превращаем в **heading + bullet list**;
 *   • это устраняет «воздушные» промежутки между пунктами вида
 *     "🔐 Безопасность" → "Шифрование AES-256" → "Auto-type" → ...
 */
function normalize(raw: string): string {
  let t = raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");

  const blocks = t
    .split(/\n{2,}/)
    .map((b) => b.replace(/^\s+|\s+$/g, ""))
    .filter(Boolean);

  const out: string[] = [];
  // Текущая компактная секция: заголовок + накопленные строки-пункты.
  let section: { heading: string; items: string[]; kind: "emoji" | "colon" } | null = null;

  const flush = () => {
    if (!section) return;
    // Если после «Заголовок:» был всего один абзац — это скорее обычный текст,
    // не превращаем его в список. Для emoji-секций старое поведение сохраняем.
    if (section.items.length === 0) {
      out.push(section.heading);
    } else if (section.kind === "colon" && section.items.length === 1) {
      out.push(`**${section.heading}**\n${section.items[0]}`);
    } else {
      // Держим heading и список в одном markdown-блоке: так между
      // «Возможности:» и первым пунктом нет лишнего пустого абзаца.
      out.push(`**${section.heading}**\n${section.items.map((x) => `- ${x}`).join("\n")}`);
    }
    section = null;
  };

  for (const block of blocks) {
    const single = isSingleLine(block);
    const readyMarkdown = !single || SKIP_GROUPING.test(block);

    if (single && COLON_SECTION.test(block) && !SKIP_GROUPING.test(block)) {
      flush();
      section = { heading: block, items: [], kind: "colon" };
      continue;
    }

    // Если блок уже выглядит как готовая markdown-конструкция — выкладываем.
    if (readyMarkdown) {
      flush();
      out.push(block);
      continue;
    }

    // Однострочный блок. Решаем по контексту.
    if (isEmojiLed(block)) {
      if (section?.kind === "colon") {
        // «Ресурсы:» + emoji-строки — это элементы этой секции, не новые headings.
        section.items.push(block);
      } else {
        flush();
        section = { heading: block, items: [], kind: "emoji" };
      }
    } else if (section) {
      // Внутри секции — копим как пункты.
      section.items.push(block);
    } else {
      out.push(block);
    }
  }
  flush();

  // Финальный проход: соседние list-item-блоки склеиваем одним переводом
  // строки (превращаем «loose list» от LLM в tight list — без обёрнутых
  // <p> внутри <li>, без лишних margin'ов и без пустых строк при копи-
  // ровании из рендера).
  const merged: string[] = [];
  for (const block of out) {
    const prev = merged[merged.length - 1];
    if (
      prev !== undefined &&
      LIST_ITEM.test(prev.split("\n").pop() || "") &&
      LIST_ITEM.test(block)
    ) {
      merged[merged.length - 1] = `${prev}\n${block}`;
    } else {
      merged.push(block);
    }
  }
  return merged.join("\n\n");
}

function isHttpUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const components: Components = {
  a({ href, children, ...props }) {
    const external = typeof href === "string" && isHttpUrl(href);
    return (
      <a
        {...props}
        href={href}
        target={external ? undefined : props.target}
        rel={external ? "noreferrer" : props.rel}
        onClick={
          external
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                void open(href).catch(() => {
                  window.open(href, "_blank", "noopener,noreferrer");
                });
              }
            : props.onClick
        }
      >
        {children}
      </a>
    );
  },
};

export function Markdown({ text }: Props) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {normalize(text)}
      </ReactMarkdown>
    </div>
  );
}
