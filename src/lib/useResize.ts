import { useEffect, useRef, useState } from "react";

interface UseResizeOpts {
  /** "right" — drag край у правой стороны контейнера; "left" — у левой. */
  edge: "left" | "right";
  initial: number;
  min: number;
  max: number;
  onChange(width: number): void;
}

/** Минималистичный хук для drag-resize боковых панелей. */
export function useResize(opts: UseResizeOpts) {
  const { edge, initial, min, max, onChange } = opts;
  const [active, setActive] = useState(false);
  const stateRef = useRef({ startX: 0, startW: initial });

  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - stateRef.current.startX;
      const delta = edge === "right" ? dx : -dx;
      const next = Math.min(max, Math.max(min, stateRef.current.startW + delta));
      onChange(next);
    };
    const onUp = () => setActive(false);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [active, edge, max, min, onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    stateRef.current = { startX: e.clientX, startW: initial };
    setActive(true);
  };

  return { active, onMouseDown };
}
