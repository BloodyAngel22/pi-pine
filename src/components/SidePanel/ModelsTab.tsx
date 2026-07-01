import { useEffect, useState } from "react";
import { Star, Pin, Search } from "@/components/ui/icons/compat";
import clsx from "clsx";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useModels } from "@/store/models";
import { useChat } from "@/store/chat";

export function ModelsTab() {
  const available = useModels((s) => s.available);
  const favorites = useModels((s) => s.favorites);
  const loading = useModels((s) => s.loadingAvailable);
  const loadAvailable = useModels((s) => s.loadAvailable);
  const loadFavorites = useModels((s) => s.loadFavorites);
  const toggleFavorite = useModels((s) => s.toggleFavorite);
  const setAsDefault = useModels((s) => s.setAsDefault);
  const isFavorite = useModels((s) => s.isFavorite);
  const switchModel = useChat((s) => s.switchModel);
  const current = useChat((s) => s.agentState?.model);
  const [filter, setFilter] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    void loadAvailable();
    void loadFavorites();
  }, [loadAvailable, loadFavorites]);

  const q = filter.toLowerCase();
  const list = available.filter((m) => {
    if (favOnly && !isFavorite(m.provider, m.id)) return false;
    if (!q) return true;
    return m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q);
  });

  const favList = favorites.filter((f) => available.some((m) => m.provider === f.provider && m.id === f.id));

  return (
    <div className="p-3 space-y-3 min-w-0">
      <div className="flex items-center gap-2">
        <Search size={12} className="text-(--color-fg-dim)" />
        <Input
          placeholder="поиск…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          className={clsx(
            "px-2 py-1 rounded",
            favOnly ? "bg-(--color-accent-soft) text-(--color-accent)" : "text-(--color-fg-mute) hover:bg-(--color-bg-mute)",
          )}
        >
          <Star size={11} className="inline mr-1" /> только избранные
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void loadAvailable();
            void loadFavorites();
          }}
        >
          обновить
        </Button>
      </div>

      {!favOnly && favList.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-(--color-fg-mute) mb-1.5">
            Избранные
          </div>
          {favList.map((f) => {
            const m = available.find((x) => x.provider === f.provider && x.id === f.id)!;
            return (
              <ModelRow
                key={`${m.provider}/${m.id}`}
                provider={m.provider}
                id={m.id}
                ctx={m.contextWindow}
                active={current?.provider === m.provider && current?.id === m.id}
                fav
                onPick={() => void switchModel(m.provider, m.id)}
                onToggleFav={() => void toggleFavorite(m.provider, m.id)}
                onSetDefault={() => void setAsDefault(m.provider, m.id)}
              />
            );
          })}
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wider font-semibold text-(--color-fg-mute) mb-1.5 flex items-center gap-2">
          {favOnly ? "Избранные" : "Все"}
          {loading && <span className="text-(--color-fg-dim) normal-case font-normal">загрузка…</span>}
        </div>
        {list.length === 0 && !loading && (
          <div className="text-xs text-(--color-fg-dim) px-2">Нет моделей</div>
        )}
        {list.map((m) => (
          <ModelRow
            key={`${m.provider}/${m.id}`}
            provider={m.provider}
            id={m.id}
            ctx={m.contextWindow}
            active={current?.provider === m.provider && current?.id === m.id}
            fav={isFavorite(m.provider, m.id)}
            onPick={() => void switchModel(m.provider, m.id)}
            onToggleFav={() => void toggleFavorite(m.provider, m.id)}
            onSetDefault={() => void setAsDefault(m.provider, m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ModelRow({
  provider,
  id,
  ctx,
  active,
  fav,
  onPick,
  onToggleFav,
  onSetDefault,
}: {
  provider: string;
  id: string;
  ctx?: number;
  active: boolean;
  fav: boolean;
  onPick(): void;
  onToggleFav(): void;
  onSetDefault(): void;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 px-2 py-1 text-xs rounded group cursor-pointer",
        active ? "bg-(--color-accent-soft)/40" : "hover:bg-(--color-bg-mute)",
      )}
      onClick={onPick}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
        className={clsx(
          "p-0.5",
          fav ? "text-(--color-warn)" : "text-(--color-fg-dim) hover:text-(--color-fg-mute)",
        )}
        title={fav ? "Убрать из избранного" : "В избранное"}
      >
        <Star size={11} fill={fav ? "currentColor" : "none"} />
      </button>
      <span className="font-mono text-(--color-fg-mute) w-24 truncate" title={provider}>
        {provider}
      </span>
      <span className="font-mono flex-1 truncate" title={id}>
        {id}
      </span>
      {ctx ? (
        <span className="text-(--color-fg-dim)">{Math.round(ctx / 1024)}k</span>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSetDefault();
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-(--color-fg-dim) hover:text-(--color-accent)"
        title="Сделать моделью по умолчанию"
      >
        <Pin size={11} />
      </button>
    </div>
  );
}
