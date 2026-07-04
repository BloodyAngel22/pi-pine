import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/store/theme";
import { Maximize } from "@/components/ui/icons/compat";
import { MermaidLightbox } from "./MermaidLightbox";

type MermaidApi = typeof import("mermaid")["default"];

let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  return mermaidPromise;
}

function readThemeVariables() {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--color-bg-soft", "#fefdf9"),
    primaryColor: v("--color-accent-soft", "#ecebff"),
    primaryTextColor: v("--color-fg", "#24231f"),
    primaryBorderColor: v("--color-accent", "#5b57e0"),
    lineColor: v("--color-fg-mute", "#68645b"),
    textColor: v("--color-fg", "#24231f"),
    mainBkg: v("--color-bg-soft", "#fefdf9"),
    secondaryColor: v("--color-bg-mute", "#efeee8"),
    tertiaryColor: v("--color-bg", "#f7f6f2"),
    nodeBorder: v("--color-border", "#dddad0"),
    clusterBkg: v("--color-bg-mute", "#efeee8"),
    clusterBorder: v("--color-border", "#dddad0"),
    edgeLabelBackground: v("--color-bg-soft", "#fefdf9"),
  };
}

interface Props {
  code: string;
}

// Debounce перед парсингом: во время стриминга код диаграммы приходит
// по кусочкам и промежуточные состояния почти всегда невалидны — не
// дёргаем mermaid на каждый токен, ждём паузы в изменениях.
const RENDER_DEBOUNCE_MS = 350;

export function Mermaid({ code }: Props) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const themeKey = useTheme((s) => s.current);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          themeVariables: readThemeVariables(),
        });
        const renderId = `mermaid-${rawId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: rendered } = await mermaid.render(renderId, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        // Пока идёт стриминг, промежуточный код почти всегда невалиден —
        // не затираем последнюю удачную отрисовку, просто запоминаем ошибку.
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, themeKey, rawId]);

  useEffect(() => {
    if (svg && containerRef.current) {
      containerRef.current.innerHTML = svg;
    }
  }, [svg]);

  if (!svg) {
    if (error) {
      return (
        <div className="mermaid-container flex flex-col gap-2 p-2.5">
          <pre className="m-0 whitespace-pre-wrap break-words text-(--color-fg-mute)">{code}</pre>
          <div className="text-xs text-(--color-danger)">
            Ошибка рендеринга диаграммы (некорректный синтаксис mermaid):
            <pre className="mt-1 mb-0 overflow-x-auto whitespace-pre font-mono">{error}</pre>
          </div>
        </div>
      );
    }
    return (
      <div className="mermaid-container flex items-center justify-center p-4 text-xs text-(--color-fg-dim)">
        Отрисовка диаграммы…
      </div>
    );
  }

  return (
    <>
      <div className="mermaid-container">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center w-6 h-6 rounded text-[10px] bg-(--color-bg)/60 text-(--color-fg-dim) opacity-50 hover:opacity-100 transition-opacity"
          title="Развернуть диаграмму"
        >
          <Maximize size={11} />
        </button>
        <div ref={containerRef} />
      </div>
      {expanded && <MermaidLightbox svg={svg} onClose={() => setExpanded(false)} />}
    </>
  );
}
