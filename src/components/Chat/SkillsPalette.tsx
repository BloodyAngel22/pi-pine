import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Info, Pin, Plus, Search, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useChat } from "@/store/chat";
import * as rpc from "@/rpc/bridge";
import { bottomSheetVariants, popoverContentVariants, softEase } from "@/lib/motionPresets";

interface PiCommand {
  name: string;
  description?: string;
  categories?: string[];
  source: "extension" | "markdown" | "prompt" | "skill";
  location?: "user" | "project" | "path";
  path?: string;
  sourceInfo?: {
    path?: string;
    baseDir?: string;
    scope?: string;
  };
}

interface Props {
  open: boolean;
  onClose(): void;
  /** Вставить /skill:name1 /skill:name2 в композер (одноразово). */
  onInsert(text: string): void;
}

export function SkillsPalette({ open, onClose, onInsert }: Props) {
  const attached = useChat((s) => s.attachedSkills);
  const toggleAttached = useChat((s) => s.toggleAttachedSkill);
  const [items, setItems] = useState<PiCommand[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    rpc
      .getCommands()
      .then((res) => {
        const skills = (res.commands || [])
          .filter((c) => c.source === "skill")
          .map((c) => ({
            ...c,
            name: c.name.startsWith("skill:") ? c.name.slice(6) : c.name,
          }));
        setItems(skills as PiCommand[]);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.categories ?? []).some((c) => c.toLowerCase().includes(q)) ||
        (s.path ?? s.sourceInfo?.path ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const pinnedItems = filtered.filter((item) => attached.includes(item.name));
  const availableItems = filtered.filter((item) => !attached.includes(item.name));
  const hiddenAvailable = Math.max(0, items.length - attached.length - availableItems.length);

  const loadPreview = async (name: string) => {
    setPreviewFor(name);
    setPreview("…");
    try {
      const detail = await rpc.getSkillDetail(name);
      setPreview(detail.content.slice(0, 900));
    } catch (e) {
      setPreview((e as Error).message);
    }
  };

  const insertPinned = () => {
    if (attached.length === 0) return;
    onInsert(attached.map((n) => `/skill:${n}`).join(" "));
    onClose();
  };

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="pi-skills-panel mb-0 overflow-hidden rounded-t-2xl border border-(--color-border) border-b-0 bg-(--color-bg-soft) shadow-[0_18px_70px_-38px_rgba(0,0,0,0.55)]"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={bottomSheetVariants(Boolean(reduceMotion))}
          transition={softEase}
        >
      <div className="flex h-11 items-center gap-2 border-b border-(--color-border-muted) px-4">
        <Sparkles size={13} className="text-(--color-accent)" />
        <div className="text-sm font-semibold text-(--color-fg)">Скиллы</div>
        <div className="text-xs text-(--color-fg-dim)">закреплено {attached.length} · доступно {items.length}</div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden h-7 items-center gap-1.5 rounded-lg border border-(--color-border-muted) bg-(--color-bg) px-2 sm:flex">
            <Search size={11} className="text-(--color-fg-dim)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="поиск"
              className="w-32 bg-transparent text-xs outline-none placeholder:text-(--color-fg-dim)"
            />
          </div>
          {attached.length > 0 && (
            <button type="button" onClick={insertPinned} className="rounded-md px-2 py-1 text-[11px] text-(--color-accent) hover:bg-(--color-accent-soft)">
              insert pinned
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-md p-1 text-(--color-fg-dim) hover:bg-(--color-bg-mute) hover:text-(--color-fg)" aria-label="Закрыть">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="grid max-h-[235px] grid-cols-1 overflow-hidden md:grid-cols-[1fr_1fr]">
        <section className="min-w-0 border-b border-(--color-border-muted) md:border-b-0 md:border-r">
          <ColumnHeader title="Закреплённые" />
          <div className="max-h-[190px] overflow-y-auto p-3 pt-2">
            {loading && <Empty>Загрузка…</Empty>}
            {!loading && pinnedItems.length === 0 && <Empty>Закрепи скиллы, чтобы они применялись к сообщениям в этой сессии.</Empty>}
            <div className="space-y-1">
              {pinnedItems.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  pinned
                  preview={previewFor === skill.name ? preview : null}
                  onPreview={() => previewFor === skill.name ? (setPreviewFor(null), setPreview(null)) : void loadPreview(skill.name)}
                  onToggle={() => toggleAttached(skill.name)}
                />
              ))}
            </div>
            {attached.length > pinnedItems.length && query && <div className="mt-2 px-1 text-[11px] text-(--color-fg-dim)">ещё закреплено: {attached.length - pinnedItems.length}</div>}
          </div>
        </section>

        <section className="min-w-0">
          <ColumnHeader title="Доступные" />
          <div className="max-h-[190px] overflow-y-auto p-3 pt-2">
            {loading && <Empty>Загрузка…</Empty>}
            {!loading && availableItems.length === 0 && <Empty>Скиллы не найдены.</Empty>}
            <div className="space-y-1">
              {availableItems.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  pinned={false}
                  preview={previewFor === skill.name ? preview : null}
                  onPreview={() => previewFor === skill.name ? (setPreviewFor(null), setPreview(null)) : void loadPreview(skill.name)}
                  onToggle={() => toggleAttached(skill.name)}
                />
              ))}
            </div>
            {(availableItems.length > 0 || hiddenAvailable > 0) && (
              <div className="mt-2 px-1 text-[11px] text-(--color-fg-dim)">
                {hiddenAvailable > 0 ? `скрыто фильтром: ${hiddenAvailable}` : `всего доступно: ${availableItems.length}`}
              </div>
            )}
          </div>
        </section>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ColumnHeader({ title }: { title: string }) {
  return <div className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-(--color-fg-dim)">{title}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-(--color-border-muted) p-3 text-xs text-(--color-fg-dim)">{children}</div>;
}

function SkillRow({
  skill,
  pinned,
  preview,
  onPreview,
  onToggle,
}: {
  skill: PiCommand;
  pinned: boolean;
  preview: string | null;
  onPreview(): void;
  onToggle(): void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={clsx(
        "rounded-lg transition-colors",
        pinned ? "bg-(--color-accent-soft)" : "hover:bg-(--color-bg-mute)",
      )}
    >
      <div className="flex h-7 items-center gap-2 px-2">
        <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", pinned ? "bg-(--color-accent)" : "bg-(--color-fg-dim)")} />
        <button type="button" onDoubleClick={() => onPreview()} className="min-w-0 flex-1 truncate text-left font-mono text-xs text-(--color-fg)" title={skill.description || skill.name}>
          {skill.name}
        </button>
        <button type="button" title="Preview SKILL.md" onClick={onPreview} className="rounded p-1 text-(--color-fg-dim) hover:bg-(--color-bg-soft) hover:text-(--color-fg)">
          <Info size={11} />
        </button>
        <button type="button" title={pinned ? "Открепить" : "Закрепить"} onClick={onToggle} className={clsx("rounded p-1 transition-colors", pinned ? "text-(--color-accent) hover:bg-(--color-bg-soft)" : "text-(--color-fg-dim) hover:bg-(--color-accent-soft) hover:text-(--color-accent)")}>
          {pinned ? <Pin size={11} /> : <Plus size={12} />}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {preview && (
          <motion.pre
            className="mx-2 mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-(--color-border-muted) bg-(--color-bg-soft) p-2 text-[10px] text-(--color-fg-dim)"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={popoverContentVariants(Boolean(reduceMotion))}
            transition={softEase}
          >
            {preview}
          </motion.pre>
        )}
      </AnimatePresence>
    </div>
  );
}
