import clsx from "clsx";
import type { ChangedFile, FileStatus } from "@/store/diff";

const STATUS_LABEL: Record<FileStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "U",
};

const STATUS_COLOR: Record<FileStatus, string> = {
  modified: "text-(--color-warning)",
  added: "text-(--color-success)",
  deleted: "text-(--color-danger)",
  renamed: "text-(--color-accent)",
  copied: "text-(--color-accent)",
  untracked: "text-(--color-fg-mute)",
};

interface Props {
  files: ChangedFile[];
  selectedPath: string | null;
  onSelect(path: string): void;
}

export function DiffFileList({ files, selectedPath, onSelect }: Props) {
  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-(--color-fg-mute) px-3 text-center">
        Нет изменений
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto py-1">
      {files.map((file) => {
        const active = file.path === selectedPath;
        return (
          <button
            key={file.path}
            type="button"
            onClick={() => onSelect(file.path)}
            title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
            className={clsx(
              "w-full flex items-center gap-1.5 px-2.5 py-1 text-left text-xs",
              active ? "bg-(--color-bg-mute)" : "hover:bg-(--color-bg-mute)/60",
            )}
          >
            <span className={clsx("w-3 shrink-0 font-mono font-semibold text-center", STATUS_COLOR[file.status])}>
              {STATUS_LABEL[file.status]}
            </span>
            <span className={clsx("flex-1 min-w-0 truncate font-mono", active ? "text-(--color-fg)" : "text-(--color-fg-mute)")}>
              {file.path}
            </span>
            {!file.binary && (file.additions > 0 || file.deletions > 0) && (
              <span className="shrink-0 font-mono text-[10px] flex items-center gap-1">
                {file.additions > 0 && <span className="text-(--color-success)">+{file.additions}</span>}
                {file.deletions > 0 && <span className="text-(--color-danger)">-{file.deletions}</span>}
              </span>
            )}
            {file.binary && <span className="shrink-0 text-[10px] text-(--color-fg-dim)">bin</span>}
          </button>
        );
      })}
    </div>
  );
}
