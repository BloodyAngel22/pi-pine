import { useState } from "react";
import { Copy, GitFork, RotateCw, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChat } from "@/store/chat";
import type { UiMessage } from "@/store/chat";

interface Props {
  message: UiMessage;
  onCopy(text: string): void;
  onFork?(): void;
  onRegenerate?(): void;
  onEdit?(text: string): void;
}

function flattenText(m: UiMessage): string {
  return m.blocks
    .filter((b) => b.kind === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
}

export function ActionBar({ message, onCopy, onFork, onRegenerate, onEdit }: Props) {
  const [copied, setCopied] = useState(false);
  const isStreaming = useChat((s) => s.agentState?.isStreaming ?? false);
  const text = flattenText(message);
  const isUser = message.role === "user";
  const handleCopy = async () => {
    onCopy(text);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1.5 text-(--color-fg-dim)">
      <Button variant="ghost" size="sm" onClick={handleCopy} icon={copied ? <Check size={12} /> : <Copy size={12} />}>
        {copied ? "Скопировано" : "Копировать"}
      </Button>
      {!isUser && onRegenerate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          icon={<RotateCw size={12} />}
          disabled={isStreaming}
          title={isStreaming ? "Дождитесь окончания стриминга" : "Регенерировать ответ"}
        >
          Регенерировать
        </Button>
      )}
      {onFork && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onFork}
          icon={<GitFork size={12} />}
          disabled={isStreaming}
          title={isStreaming ? "Дождитесь окончания стриминга" : "Создать ветку от этой точки"}
        >
          Форк
        </Button>
      )}
      {isUser && onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(text)}
          icon={<Pencil size={12} />}
          disabled={isStreaming}
          title={isStreaming ? "Дождитесь окончания стриминга" : "Редактировать сообщение"}
        >
          Редактировать
        </Button>
      )}
    </div>
  );
}
