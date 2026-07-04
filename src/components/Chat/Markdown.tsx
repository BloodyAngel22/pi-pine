import { memo, useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "@/components/ui/icons/compat";
import { open } from "@tauri-apps/plugin-shell";
import { Mermaid } from "./Mermaid";

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

function extractCodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(extractCodeText).join("");
  if ("props" in node) {
    const el = node as { props?: { children?: React.ReactNode } };
    if (el.props?.children != null) return extractCodeText(el.props.children);
  }
  return "";
}

// Ищем className внутреннего <code> (rehype-highlight ставит "language-xxx"),
// чтобы отличить mermaid-блок от обычного кода — сам <pre> его не несёт.
function findCodeClassName(node: React.ReactNode): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findCodeClassName(n);
      if (found) return found;
    }
    return undefined;
  }
  if ("props" in node) {
    const el = node as { props?: { className?: string } };
    return el.props?.className;
  }
  return undefined;
}

function CodeBlock({ children, className, ...props }: React.ComponentPropsWithoutRef<"pre">) {
  const [copied, setCopied] = useState(false);
  const codeText = extractCodeText(children);
  const codeClassName = findCodeClassName(children);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [codeText]);

  if (codeClassName?.includes("language-mermaid")) {
    return <Mermaid code={codeText} />;
  }

  return (
    <pre className={className} {...props}>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center w-6 h-6 rounded text-[10px] bg-(--color-bg)/60 text-(--color-fg-dim) opacity-50 hover:opacity-100 transition-opacity"
        title="Копировать код"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
      {children}
    </pre>
  );
}

const components: Components = {
  pre: CodeBlock,
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

function MarkdownComponent({ text }: Props) {
  const normalized = useMemo(() => normalize(text), [text]);
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownComponent);
