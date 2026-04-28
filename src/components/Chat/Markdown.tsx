import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

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
  // Текущая «emoji-секция»: заголовок + накопленные строки-пункты.
  let section: { heading: string; items: string[] } | null = null;

  const flush = () => {
    if (!section) return;
    if (section.items.length === 0) {
      // Один заголовок без пунктов — оставляем как обычный параграф.
      out.push(section.heading);
    } else {
      // Bold-«заголовок» (а не #### — чтобы не ломать визуальную иерархию
      // основных markdown-headings).
      out.push(`**${section.heading}**`);
      out.push(section.items.map((x) => `- ${x}`).join("\n"));
    }
    section = null;
  };

  for (const block of blocks) {
    // Если блок уже выглядит как готовая markdown-конструкция — выкладываем.
    if (!isSingleLine(block) || SKIP_GROUPING.test(block)) {
      flush();
      out.push(block);
      continue;
    }
    // Однострочный блок. Решаем по контексту.
    if (isEmojiLed(block)) {
      flush();
      section = { heading: block, items: [] };
    } else if (section) {
      // Внутри emoji-секции — копим как пункты.
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

export function Markdown({ text }: Props) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      >
        {normalize(text)}
      </ReactMarkdown>
    </div>
  );
}
