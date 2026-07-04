import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { modalOverlayVariants, softEase } from "@/lib/motionPresets";
import { X, ZoomIn, ZoomOut, RefreshCw } from "@/components/ui/icons/compat";

interface Props {
  svg: string;
  onClose: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 12;
// Мультипликативный зум (как в Figma/Google Maps): на высоких масштабах
// шаг в процентах даёт куда более плавное приближение, чем фиксированный
// прирост — с фикс.шагом 0.2 дойти до 12x потребовалось бы полсотни кликов.
const BUTTON_ZOOM_FACTOR = 1.3;
const WHEEL_ZOOM_FACTOR = 1.08;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, +value.toFixed(3)));
}

export function MermaidLightbox({ svg, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const [scale, setScaleState] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // scaleRef держит АКТУАЛЬНОЕ значение синхронно (в отличие от state,
  // которое обновится только на следующий рендер) — нужно центрированию
  // и zoomAt, чтобы всегда мерить/считать от реального применённого scale.
  const scaleRef = useRef(1);

  const setScale = useCallback((updater: number | ((prev: number) => number)) => {
    setScaleState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: number) => number)(prev) : updater;
      scaleRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Центрирует диаграмму по её РЕАЛЬНОМУ отрендеренному размеру.
  //
  // Раньше размер брался из svgEl.viewBox (напр. "0 0 455 259"), но у
  // mermaid SVG имеет width="100%" без height и viewBox с ненулевым
  // смещением — реальный отрендеренный пиксельный размер тут вообще не
  // совпадает с числами viewBox (эмпирически: viewBox 455×259, а
  // фактический рендер — около 300×171). Из-за этого центрирование
  // считало смещение по неверным величинам, и диаграмма открывалась
  // «где-то в другом месте» вместо центра. getBoundingClientRect — то,
  // что реально нарисовано; делим на текущий scale, чтобы получить
  // размер именно при масштабе 1.
  const centerContent = useCallback(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;
    const rect = content.getBoundingClientRect();
    const currentScale = scaleRef.current || 1;
    const naturalW = rect.width / currentScale;
    const naturalH = rect.height / currentScale;
    x.set((viewport.clientWidth - naturalW) / 2);
    y.set((viewport.clientHeight - naturalH) / 2);
    setScale(1);
  }, [x, y, setScale]);

  // При загрузке новой диаграммы (первый рендер или смена темы) центрируем
  // её и сбрасываем зум — useLayoutEffect, чтобы не было видимого «прыжка»
  // от (0,0) к центру перед первым кадром.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.innerHTML = svg;
    centerContent();
    // svg меняется реже, чем centerContent (которая зависит от x/y/setScale,
    // но не должна пере-запускаться из-за них) — эффект должен сработать
    // именно на смену диаграммы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg]);

  // Зум "к курсору"/"к центру": без этого масштаб всегда растёт вокруг
  // центра диаграммы, и после каждого шага зума картинка утекает из-под
  // курсора — приходится постоянно перетаскивать заново, что и выглядит
  // как "перемещение сломалось" после увеличения диапазона зума.
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      setScale((prevScale) => {
        const newScale = clampScale(prevScale * factor);
        if (newScale === prevScale) return prevScale;
        const contentX = (px - x.get()) / prevScale;
        const contentY = (py - y.get()) / prevScale;
        x.set(px - contentX * newScale);
        y.set(py - contentY * newScale);
        return newScale;
      });
    },
    [x, y, setScale],
  );

  // React регистрирует onWheel как passive-слушатель — preventDefault там
  // не работает и браузер всё равно проскроллит страницу под лайтбоксом.
  // Вешаем нативный слушатель с passive:false, чтобы колесо мыши зумило,
  // а не скроллило фон.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const zoomButtonAt = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, factor);
    },
    [zoomAt],
  );

  const iconBtn =
    "inline-flex items-center justify-center w-7 h-7 rounded text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute) transition-colors";

  // Каждое сообщение в MessageList обёрнуто в motion.div (.pi-stream-item),
  // которому framer-motion выставляет inline transform — это создаёт новый
  // containing block, и вложенный fixed inset-0 позиционируется относительно
  // строки сообщения, а не вьюпорта (лайтбокс схлопывается в невидимую
  // область). Портал в document.body выносит оверлей из-под этого transform.
  //
  // Фон сделан полностью непрозрачным (цвет темы, а не bg-black/NN):
  // полупрозрачный фон пропускал текст чата под диаграммой, из-за чего
  // всё сливалось и было плохо видно.
  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col bg-(--color-bg-soft)"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={modalOverlayVariants(Boolean(reduceMotion))}
        transition={softEase}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex items-center justify-between border-b border-(--color-border-muted) px-4 py-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => zoomButtonAt(1 / BUTTON_ZOOM_FACTOR)} className={iconBtn} title="Уменьшить">
              <ZoomOut size={14} />
            </button>
            <button type="button" onClick={centerContent} className={iconBtn} title="Сбросить масштаб">
              <RefreshCw size={13} />
            </button>
            <button type="button" onClick={() => zoomButtonAt(BUTTON_ZOOM_FACTOR)} className={iconBtn} title="Увеличить">
              <ZoomIn size={14} />
            </button>
            <span className="ml-1 text-xs text-(--color-fg-dim) tabular-nums select-none">{Math.round(scale * 100)}%</span>
          </div>
          <button type="button" onClick={onClose} className={iconBtn} title="Закрыть (Esc)">
            <X size={16} />
          </button>
        </div>
        <div ref={viewportRef} className="relative flex-1 overflow-hidden">
          {/* Отдельный слой на весь вьюпорт ловит перетаскивание (onPan не
              двигает сам элемент — в отличие от `drag`, он не сужает
              область захвата при панорамировании), а x/y/scale руками
              применяются к контенту — так зона "потяни откуда угодно"
              всегда покрывает весь вьюпорт, независимо от масштаба. */}
          <motion.div
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            onPan={(_e, info) => {
              x.set(x.get() + info.delta.x);
              y.set(y.get() + info.delta.y);
            }}
          >
            <motion.div
              ref={contentRef}
              style={{ x, y, scale, position: "absolute", left: 0, top: 0, transformOrigin: "0 0" }}
              className="pointer-events-none [&_svg]:max-w-none"
            />
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
