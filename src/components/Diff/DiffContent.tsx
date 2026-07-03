import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Copy, MessageCircleQuestion } from "@/components/ui/icons/compat";
import { formatDiffReference, nearestNewLineNo, parseFileDiff, type ParsedDiffLine } from "@/lib/gitDiff";
import { useActiveDiffText, type ChangedFile } from "@/store/diff";
import { useChat } from "@/store/chat";

interface Props {
  file: ChangedFile | null;
  activeHunkIndex: number;
}

interface Selection {
  path: string;
  anchorIdx: number;
  focusIdx: number;
}

function lineClass(type: ParsedDiffLine["type"]): string {
  if (type === "add") return "bg-(--color-success)/10";
  if (type === "del") return "bg-(--color-danger)/10";
  return "";
}

function lineTextClass(type: ParsedDiffLine["type"]): string {
  if (type === "add") return "text-(--color-success)";
  if (type === "del") return "text-(--color-danger)";
  return "text-(--color-fg-mute)";
}

function linePrefix(type: ParsedDiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Копировать относительный путь: ${path}`}
      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-(--color-fg-dim) hover:text-(--color-accent) hover:bg-(--color-bg-mute) transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

export function DiffContent({ file, activeHunkIndex }: Props) {
  const { text: diffText } = useActiveDiffText(file);
  const parsed = useMemo(() => (file ? parseFileDiff(diffText) : null), [file, diffText]);
  const flatLines = useMemo(() => parsed?.hunks.flatMap((h) => h.lines) ?? [], [parsed]);
  const hunkOffsets = useMemo(() => {
    let acc = 0;
    return (parsed?.hunks.map((h) => {
      const start = acc;
      acc += h.lines.length;
      return start;
    }) ?? []) as number[];
  }, [parsed]);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [justAsked, setJustAsked] = useState(false);

  useEffect(() => {
    setSelection(null);
    setJustAsked(false);
  }, [file?.path, diffText]);

  function handleGutterClick(flatIdx: number, shiftKey: boolean) {
    if (!file) return;
    setSelection((prev) =>
      shiftKey && prev && prev.path === file.path
        ? { path: file.path, anchorIdx: prev.anchorIdx, focusIdx: flatIdx }
        : { path: file.path, anchorIdx: flatIdx, focusIdx: flatIdx },
    );
  }

  const selRange =
    selection && file && selection.path === file.path
      ? ([Math.min(selection.anchorIdx, selection.focusIdx), Math.max(selection.anchorIdx, selection.focusIdx)] as const)
      : null;
  const isSelected = (flatIdx: number) => !!selRange && flatIdx >= selRange[0] && flatIdx <= selRange[1];

  function handleAskAgent() {
    if (!file || !selRange) return;
    const [lo, hi] = selRange;
    const rangeLines = flatLines.slice(lo, hi + 1);
    const startLine = nearestNewLineNo(flatLines, lo) ?? 0;
    const endLine = nearestNewLineNo(flatLines, hi) ?? startLine;
    useChat.getState().injectComposer(formatDiffReference(file.path, rangeLines, startLine, endLine));
    setJustAsked(true);
    setTimeout(() => {
      setJustAsked(false);
      setSelection(null);
    }, 1500);
  }

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-(--color-fg-mute)">
        Выберите файл слева
      </div>
    );
  }

  if (file.binary) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-(--color-fg-mute)">
        Бинарный файл — предпросмотр недоступен
      </div>
    );
  }

  if (!parsed || parsed.hunks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-(--color-fg-mute)">
        Нет текстовых изменений
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="pi-diff-content flex-1 min-h-0 overflow-auto font-mono">
        <div className="sticky top-0 z-10 h-7 flex items-center gap-1.5 px-2.5 bg-(--color-bg-soft) border-b border-(--color-border) text-(--color-fg-mute)">
          <span className="flex-1 min-w-0 truncate">{file.path}</span>
          <CopyPathButton path={file.path} />
        </div>
        {parsed.hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex} data-hunk-index={hunkIndex}>
            <div
              className={clsx(
                "sticky top-7 px-2.5 py-0.5 text-(--color-fg-dim) bg-(--color-bg-soft) border-y border-(--color-border)",
                hunkIndex === activeHunkIndex && "text-(--color-accent)",
              )}
            >
              {hunk.header}
            </div>
            {hunk.lines.map((line, lineIndex) => {
              const flatIdx = hunkOffsets[hunkIndex] + lineIndex;
              return (
                <div
                  key={lineIndex}
                  className={clsx("flex whitespace-pre-wrap", lineClass(line.type))}
                  style={
                    isSelected(flatIdx)
                      ? { boxShadow: "inset 0 0 0 9999px color-mix(in srgb, var(--color-accent) 14%, transparent)" }
                      : undefined
                  }
                >
                  <span
                    className="w-10 shrink-0 text-right pr-1.5 text-(--color-fg-dim) select-none cursor-pointer hover:text-(--color-fg)"
                    onClick={(e) => handleGutterClick(flatIdx, e.shiftKey)}
                  >
                    {line.oldLineNo ?? ""}
                  </span>
                  <span
                    className="w-10 shrink-0 text-right pr-1.5 text-(--color-fg-dim) select-none cursor-pointer hover:text-(--color-fg)"
                    onClick={(e) => handleGutterClick(flatIdx, e.shiftKey)}
                  >
                    {line.newLineNo ?? ""}
                  </span>
                  <span className={clsx("shrink-0 select-none", lineTextClass(line.type))}>{linePrefix(line.type)}</span>
                  <span className="flex-1 min-w-0 pl-1 whitespace-pre-wrap break-all">{line.text}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {selRange && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={handleAskAgent}
            disabled={justAsked}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shadow-md transition-colors",
              justAsked
                ? "bg-(--color-success) text-white"
                : "bg-(--color-accent) text-white hover:bg-(--color-accent)/90",
            )}
          >
            {justAsked ? <Check size={13} /> : <MessageCircleQuestion size={13} />}
            {justAsked ? "Добавлено в чат" : "Спросить агента"}
          </button>
        </div>
      )}
    </div>
  );
}
