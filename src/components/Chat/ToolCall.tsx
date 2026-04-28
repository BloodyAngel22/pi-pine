import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, AlertCircle } from "lucide-react";
import clsx from "clsx";
import type { UiBlockTool } from "@/store/chat";

function shortInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    const str = JSON.stringify(input);
    if (str.length < 80) return str;
    if (input && typeof input === "object") {
      const o = input as Record<string, unknown>;
      // самые частые поля для file/bash тулзов
      for (const k of ["file_path", "filePath", "path", "command", "url", "query"]) {
        if (typeof o[k] === "string") return String(o[k]);
      }
    }
    return str.slice(0, 80) + "…";
  } catch {
    return String(input);
  }
}

function pretty(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function ToolCall({ block }: { block: UiBlockTool }) {
  const [open, setOpen] = useState(false);
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  return (
    <div
      className={clsx(
        "my-1 rounded-md border text-xs",
        isError
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-border) bg-(--color-bg-soft)",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isError ? (
          <AlertCircle size={12} className="text-(--color-danger)" />
        ) : (
          <Wrench size={12} className="text-(--color-fg-mute)" />
        )}
        <span className="font-mono text-(--color-accent)">{block.name}</span>
        <span className="font-mono text-(--color-fg-mute) truncate">
          {shortInput(block.input)}
        </span>
        <span className="ml-auto text-(--color-fg-dim)">
          {isRunning ? "…" : isError ? "ошибка" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {block.input != null && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">input</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2">
                {pretty(block.input)}
              </pre>
            </div>
          )}
          {block.output != null && block.output !== "" && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">output</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {pretty(block.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
