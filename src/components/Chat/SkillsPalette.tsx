import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Search, X, Plus, Pin, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChat } from "@/store/chat";
import * as rpc from "@/rpc/bridge";

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
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPicked(new Set());
    rpc
      .getCommands()
      .then((res) => {
        const skills = (res.commands || [])
          .filter((c) => c.source === "skill")
          .map((c) => ({
            ...c,
            // pi отдаёт name="skill:caveman"; убираем префикс,
            // чтобы хранить и отображать чистое имя.
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

  const grouped = useMemo(() => {
    const groups = new Map<string, PiCommand[]>();
    for (const item of filtered) {
      const cats = item.categories && item.categories.length > 0 ? item.categories : ["uncategorized"];
      for (const cat of cats) {
        const bucket = groups.get(cat) ?? [];
        bucket.push(item);
        groups.set(cat, bucket);
      }
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const loadPreview = async (name: string) => {
    setPreviewFor(name);
    setPreview("…");
    try {
      const detail = await rpc.getSkillDetail(name);
      setPreview(detail.content.slice(0, 1200));
    } catch (e) {
      setPreview((e as Error).message);
    }
  };

  if (!open) return null;

  const insertSelected = () => {
    const names = Array.from(picked);
    if (names.length === 0) return onClose();
    const text = names.map((n) => `/skill:${n}`).join(" ");
    onInsert(text);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center pb-2">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[680px] mx-2 bg-(--color-bg-soft) border border-(--color-border) rounded-lg shadow-2xl flex flex-col max-h-[70vh] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-(--color-border) px-2 py-1.5">
          <Search size={12} className="text-(--color-fg-dim)" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск скиллов…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-(--color-fg-dim)"
          />
          <span className="text-[10px] text-(--color-fg-dim)">
            {filtered.length}/{items.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-(--color-fg-dim) hover:text-(--color-fg)"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-3 py-4 text-xs text-(--color-fg-dim)">…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-(--color-fg-dim)">
              Скиллы не найдены. Установи их в pi (например, через /skill).
            </div>
          )}
          {grouped.map(([category, skills]) => (
            <div key={category}>
              <div className="sticky top-0 z-10 px-3 py-1 text-[10px] uppercase tracking-wide text-(--color-fg-dim) bg-(--color-bg-soft) border-y border-(--color-border)/50">
                {category} · {skills.length}
              </div>
              {skills.map((s) => {
                const isPicked = picked.has(s.name);
                const isPinned = attached.includes(s.name);
                const sourcePath = s.path ?? s.sourceInfo?.path ?? s.sourceInfo?.baseDir;
                return (
                  <div
                    key={`${category}:${s.name}`}
                    onClick={() => {
                      setPicked((p) => {
                        const next = new Set(p);
                        if (next.has(s.name)) next.delete(s.name);
                        else next.add(s.name);
                        return next;
                      });
                    }}
                    className={clsx(
                      "px-3 py-1.5 border-b border-(--color-border)/40 cursor-pointer flex items-start gap-2",
                      isPicked
                        ? "bg-(--color-accent-soft)/40"
                        : "hover:bg-(--color-bg-mute)",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isPicked}
                      readOnly
                      className="mt-0.5 accent-(--color-accent)"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs truncate">{s.name}</span>
                        {(s.categories ?? []).map((cat) => (
                          <span key={cat} className="text-[9px] px-1 rounded bg-(--color-bg-mute) text-(--color-fg-dim)">{cat}</span>
                        ))}
                      </div>
                      {s.description && (
                        <div className="text-[11px] text-(--color-fg-dim) line-clamp-2">
                          {s.description}
                        </div>
                      )}
                      {sourcePath && (
                        <div className="mt-0.5 text-[10px] text-(--color-fg-mute) font-mono truncate" title={sourcePath}>
                          {s.location ?? s.sourceInfo?.scope ?? "path"}: {sourcePath}
                        </div>
                      )}
                      {previewFor === s.name && preview && (
                        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-(--color-bg)/70 border border-(--color-border)/50 p-1.5 text-[10px] text-(--color-fg-dim)">{preview}</pre>
                      )}
                    </div>
                    <button
                      type="button"
                      title="Preview SKILL.md"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (previewFor === s.name) {
                          setPreviewFor(null);
                          setPreview(null);
                        } else {
                          void loadPreview(s.name);
                        }
                      }}
                      className="p-1 rounded text-(--color-fg-dim) hover:text-(--color-fg) hover:bg-(--color-bg-mute)"
                    >
                      <Info size={10} />
                    </button>
                    <button
                      type="button"
                      title={isPinned ? "Открепить" : "Закрепить (добавлять ко всем сообщениям сессии)"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAttached(s.name);
                      }}
                      className={clsx(
                        "p-1 rounded transition-colors",
                        isPinned
                          ? "text-(--color-accent) bg-(--color-accent-soft)/30"
                          : "text-(--color-fg-dim) hover:text-(--color-fg) hover:bg-(--color-bg-mute)",
                      )}
                    >
                      <Pin size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="border-t border-(--color-border) px-2 py-1.5 flex items-center gap-2">
          <span className="text-[11px] text-(--color-fg-dim) flex-1 truncate">
            {picked.size > 0
              ? `Выбрано: ${Array.from(picked).join(", ")}`
              : attached.length > 0
                ? `Закреплено: ${attached.join(", ")}`
                : "Чекбокс — добавить в сообщение, булавка — закрепить за сессией"}
          </span>
          <Button variant="subtle" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={12} />}
            onClick={insertSelected}
            disabled={picked.size === 0}
          >
            Добавить в сообщение
          </Button>
        </div>
      </div>
    </div>
  );
}
