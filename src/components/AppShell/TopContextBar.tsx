import { Folder, GitBranch, ShieldAlert, ListTodo } from "lucide-react";
import { useChat } from "@/store/chat";
import { useExt } from "@/store/ext";
import { ContextIndicator } from "@/components/Chat/ContextIndicator";
import clsx from "clsx";

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) || path || "cwd";
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "danger" }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium",
        tone === "neutral" && "border-(--color-border) bg-(--color-bg-soft) text-(--color-fg-mute)",
        tone === "warn" && "border-(--color-warn)/25 bg-(--color-warn)/10 text-(--color-warn)",
        tone === "danger" && "border-(--color-danger)/25 bg-(--color-danger)/10 text-(--color-danger)",
      )}
    >
      {children}
    </span>
  );
}

export function TopContextBar() {
  const cwd = useChat((s) => s.cwd);
  const planMode = useChat((s) => s.planMode);
  const planFilePath = useChat((s) => s.planFilePath);
  const activeTabId = useChat((s) => s.activeTabId);
  const yoloMode = useExt((s) => s.yoloMode);

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-(--color-border-muted) bg-(--color-bg)/75 px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Badge>
          <Folder size={12} />
          <span className="max-w-[28vw] truncate" title={cwd}>{basename(cwd)}</span>
        </Badge>
        {activeTabId && (
          <Badge>
            <GitBranch size={12} />
            <span className="max-w-[18vw] truncate">{activeTabId.slice(0, 8)}</span>
          </Badge>
        )}
        {planMode && (
          <Badge tone="warn">
            <ListTodo size={12} />
            <span title={planFilePath || undefined}>Plan</span>
          </Badge>
        )}
        {yoloMode && (
          <Badge tone="danger">
            <ShieldAlert size={12} />
            YOLO
          </Badge>
        )}
      </div>
      <ContextIndicator />
    </div>
  );
}
