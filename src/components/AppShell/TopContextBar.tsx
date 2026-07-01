import { useChat } from "@/store/chat";
import { useExt } from "@/store/ext";
import { ContextIndicator } from "@/components/Chat/ContextIndicator";
import { AppIcon } from "@/components/ui/AppIcon";
import { Chip } from "@/components/ui/Chip";

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) || path || "cwd";
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
        <Chip icon={<AppIcon name="folder" size={12} />} mono title={cwd}>
          <span className="max-w-[28vw] truncate">{basename(cwd)}</span>
        </Chip>
        {activeTabId && (
          <Chip icon={<AppIcon name="gitBranch" size={12} />} mono title={activeTabId}>
            <span className="max-w-[18vw] truncate">{activeTabId.slice(0, 8)}</span>
          </Chip>
        )}
        {planMode && (
          <Chip tone="warning" variant="mode" icon={<AppIcon name="plan" size={12} />} title={planFilePath || undefined}>
            Plan
          </Chip>
        )}
        {yoloMode && (
          <Chip
            tone="danger"
            variant="mode"
            icon={<AppIcon name="yolo" size={12} />}
            title="YOLO permissions / Auto-approve включены"
          >
            YOLO
          </Chip>
        )}
      </div>
      <ContextIndicator />
    </div>
  );
}
