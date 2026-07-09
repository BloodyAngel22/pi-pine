import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, ChevronUp, Copy, MessageCircleQuestion } from "@/components/ui/icons/compat";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  buildCompactBlocks,
  formatDiffReference,
  groupChangedLines,
  hunkOffsets as computeHunkOffsets,
  nearestNewLineNo,
  parseFileDiff,
  type ParsedDiffLine,
} from "@/lib/gitDiff";
import { useActiveDiffText, type ChangedFile } from "@/store/diff";
import { useChat } from "@/store/chat";
import { useUiPrefs } from "@/store/uiPrefs";

interface Props {
  file: ChangedFile | null;
  activeGroupIndex: number;
  groupCount: number;
  focusLineIdx?: number | null;
  onPrevGroup(): void;
  onNextGroup(): void;
}

interface Selection {
  path: string;
  anchorIdx: number;
  focusIdx: number;
}

interface DiffSection {
  header: string;
  rows: { flatIdx: number; line: ParsedDiffLine }[];
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

function ChangeNavButtons({
  activeGroupIndex,
  groupCount,
  onPrevGroup,
  onNextGroup,
}: {
  activeGroupIndex: number;
  groupCount: number;
  onPrevGroup(): void;
  onNextGroup(): void;
}) {
  if (groupCount <= 1) return null;
  return (
    <div className="shrink-0 flex items-center gap-0.5">
      <span className="px-1 text-[10px] tabular-nums text-(--color-fg-dim)">
        {activeGroupIndex + 1}/{groupCount}
      </span>
      <button
        type="button"
        onClick={onPrevGroup}
        disabled={activeGroupIndex === 0}
        title="Предыдущее изменение (Alt+↑)"
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg) disabled:opacity-40 disabled:pointer-events-none"
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        onClick={onNextGroup}
        disabled={activeGroupIndex === groupCount - 1}
        title="Следующее изменение (Alt+↓)"
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg) disabled:opacity-40 disabled:pointer-events-none"
      >
        <ChevronDown size={16} />
      </button>
    </div>
  );
}

export function DiffContent({ file, activeGroupIndex, groupCount, focusLineIdx, onPrevGroup, onNextGroup }: Props) {
  const { text: diffText } = useActiveDiffText(file);
  const parsed = useMemo(() => (file ? parseFileDiff(diffText) : null), [file, diffText]);
  const flatLines = useMemo(() => parsed?.hunks.flatMap((h) => h.lines) ?? [], [parsed]);
  const hunkOffsets = useMemo(() => (parsed ? computeHunkOffsets(parsed.hunks) : []), [parsed]);
  const diffViewMode = useUiPrefs((s) => s.diffViewMode);
  const setDiffViewMode = useUiPrefs((s) => s.setDiffViewMode);

  const changeGroups = useMemo(() => groupChangedLines(flatLines), [flatLines]);
  const sections = useMemo((): DiffSection[] => {
    if (diffViewMode === "compact" && changeGroups.length > 0) {
      return buildCompactBlocks(flatLines, changeGroups).map((block) => ({ header: block.header, rows: block.rows }));
    }
    if (!parsed) return [];
    return parsed.hunks.map((hunk, hunkIndex) => ({
      header: hunk.header,
      rows: hunk.lines.map((line, lineIndex) => ({ flatIdx: hunkOffsets[hunkIndex] + lineIndex, line })),
    }));
  }, [diffViewMode, changeGroups, flatLines, parsed, hunkOffsets]);

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
        <div className="sticky top-0 z-10 h-9 flex items-center gap-1.5 px-2.5 bg-(--color-bg-soft) border-b border-(--color-border) text-(--color-fg-mute)">
          <span className="flex-1 min-w-0 truncate">{file.path}</span>
          <ChangeNavButtons
            activeGroupIndex={activeGroupIndex}
            groupCount={groupCount}
            onPrevGroup={onPrevGroup}
            onNextGroup={onNextGroup}
          />
          <SegmentedControl
            value={diffViewMode}
            onChange={setDiffViewMode}
            ariaLabel="Режим отображения диффа"
            options={[
              { value: "compact", label: "Компактно" },
              { value: "full", label: "Полностью" },
            ]}
          />
          <CopyPathButton path={file.path} />
        </div>
        {sections.map((section, sectionIndex) => {
          const prevEnd = sectionIndex === 0 ? -1 : sections[sectionIndex - 1].rows.at(-1)!.flatIdx;
          const hiddenBefore = section.rows[0].flatIdx - prevEnd - 1;
          return (
            <div key={sectionIndex}>
              {diffViewMode === "compact" && hiddenBefore > 0 && (
                <div className="px-2.5 py-1 text-center text-(--color-fg-dim) bg-(--color-bg-soft) border-y border-(--color-border)">
                  ⋯ {hiddenBefore} {hiddenBefore === 1 ? "строка" : "строк"} без изменений ⋯
                </div>
              )}
              <div className="sticky top-9 px-2.5 py-0.5 text-(--color-fg-dim) bg-(--color-bg-soft) border-y border-(--color-border)">
                {section.header}
              </div>
              {section.rows.map(({ flatIdx, line }) => (
                <div
                  key={flatIdx}
                  data-line-idx={flatIdx}
                  className={clsx("flex whitespace-pre-wrap", lineClass(line.type))}
                  style={
                    flatIdx === focusLineIdx
                      ? { boxShadow: "inset 0 0 0 9999px color-mix(in srgb, var(--color-accent) 28%, transparent)" }
                      : isSelected(flatIdx)
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
              ))}
            </div>
          );
        })}
        {diffViewMode === "compact" &&
          sections.length > 0 &&
          (() => {
            const hiddenAfter = flatLines.length - 1 - sections.at(-1)!.rows.at(-1)!.flatIdx;
            return hiddenAfter > 0 ? (
              <div className="px-2.5 py-1 text-center text-(--color-fg-dim) bg-(--color-bg-soft) border-y border-(--color-border)">
                ⋯ {hiddenAfter} {hiddenAfter === 1 ? "строка" : "строк"} без изменений ⋯
              </div>
            ) : null;
          })()}
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
