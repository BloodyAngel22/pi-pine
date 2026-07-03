import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, GitFork, Loader2, RefreshCw } from "@/components/ui/icons/compat";
import { useActiveDiffText, useDiff } from "@/store/diff";
import { parseFileDiff } from "@/lib/gitDiff";
import { useResize } from "@/lib/useResize";
import { DiffFileList } from "./DiffFileList";
import { DiffContent } from "./DiffContent";

interface Props {
  open: boolean;
  onClose(): void;
}

export function DiffPanel({ open, onClose }: Props) {
  const isRepo = useDiff((s) => s.isRepo);
  const files = useDiff((s) => s.files);
  const selectedPath = useDiff((s) => s.selectedPath);
  const loading = useDiff((s) => s.loading);
  const error = useDiff((s) => s.error);
  const selectFile = useDiff((s) => s.selectFile);
  const selectNextFile = useDiff((s) => s.selectNextFile);
  const selectPrevFile = useDiff((s) => s.selectPrevFile);
  const refresh = useDiff((s) => s.refresh);

  const [listWidth, setListWidth] = useState(260);
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const resize = useResize({ edge: "right", initial: listWidth, min: 160, max: 480, onChange: setListWidth });

  const selectedFile = useMemo(() => files.find((f) => f.path === selectedPath) ?? null, [files, selectedPath]);
  const { text: activeDiffText } = useActiveDiffText(selectedFile);
  const hunkCount = useMemo(() => parseFileDiff(activeDiffText).hunks.length, [activeDiffText]);

  useEffect(() => {
    setActiveHunkIndex(0);
  }, [selectedPath]);

  useEffect(() => {
    if (!open) return;
    const el = contentRef.current?.querySelector(`[data-hunk-index="${activeHunkIndex}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [activeHunkIndex, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inEditable) return;
      const container = contentRef.current?.closest("[data-diff-panel]");
      if (!container?.contains(document.activeElement) && document.activeElement !== document.body) return;

      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        setActiveHunkIndex((i) => Math.min(hunkCount - 1, i + 1));
        return;
      }
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        setActiveHunkIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowDown") {
        e.preventDefault();
        selectNextFile();
        return;
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowUp") {
        e.preventDefault();
        selectPrevFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hunkCount, selectNextFile, selectPrevFile]);

  return (
    <section data-diff-panel className={open ? "flex-1 min-h-0 bg-(--color-bg) flex flex-col" : "hidden"} tabIndex={-1}>
      <div className="h-9 shrink-0 flex items-center gap-2 border-b border-(--color-border) bg-(--color-bg-soft) px-2.5">
        <div className="flex items-center gap-1.5 text-xs text-(--color-fg-mute)">
          <GitFork size={13} />
          <span className="font-medium">Diff</span>
        </div>
        {files.length > 0 && (
          <span className="text-[10px] text-(--color-fg-dim)">{files.length} файл(ов)</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg) disabled:opacity-50"
          title="Обновить"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)"
          title="Свернуть diff"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {!isRepo ? (
        <div className="flex-1 flex items-center justify-center text-xs text-(--color-fg-mute)">
          Текущая папка не является git-репозиторием
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-xs text-(--color-danger) px-4 text-center">
          {error}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div className="shrink-0 flex flex-col border-r border-(--color-border)" style={{ width: listWidth }}>
            <DiffFileList files={files} selectedPath={selectedPath} onSelect={selectFile} />
          </div>
          <div
            onMouseDown={resize.onMouseDown}
            className={clsx(
              "w-1 shrink-0 cursor-col-resize hover:bg-(--color-accent)/40",
              resize.active && "bg-(--color-accent)/40",
            )}
          />
          <div ref={contentRef} className="flex-1 min-w-0 flex flex-col">
            <DiffContent file={selectedFile} activeHunkIndex={activeHunkIndex} />
          </div>
        </div>
      )}
    </section>
  );
}
