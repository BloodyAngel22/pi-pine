import { useEffect, useRef, useState } from "react";

interface Options {
  active?: boolean;
  chunkSize?: number;
  enabledThreshold?: number;
}

interface ChunkedRenderResult<T> {
  items: T[];
  renderedCount: number;
  totalCount: number;
  done: boolean;
}

const DEFAULT_CHUNK_SIZE = 40;
const DEFAULT_ENABLED_THRESHOLD = 80;

/**
 * Incrementally exposes items in requestAnimationFrame-sized chunks.
 *
 * This keeps large chat histories from blocking the main thread on the
 * first mount while preserving normal DOM flow (no virtual positioning).
 */
export function useChunkedRender<T>(items: readonly T[], options: Options = {}): ChunkedRenderResult<T> {
  const active = options.active ?? true;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const enabledThreshold = options.enabledThreshold ?? DEFAULT_ENABLED_THRESHOLD;
  const chunkingEnabled = items.length > enabledThreshold;
  const initialCount = chunkingEnabled ? Math.min(items.length, chunkSize) : items.length;
  const [renderedCount, setRenderedCount] = useState(initialCount);
  const previousItemsRef = useRef(items);

  useEffect(() => {
    if (previousItemsRef.current === items) return;

    const previousItems = previousItemsRef.current;
    previousItemsRef.current = items;

    setRenderedCount((current) => {
      if (items.length <= enabledThreshold) return items.length;

      // Appends during streaming should not hide already rendered content.
      if (items.length >= previousItems.length && current >= previousItems.length) {
        return Math.min(items.length, current + chunkSize);
      }

      // A different history/tab starts from a small chunk.
      return Math.min(items.length, chunkSize);
    });
  }, [chunkSize, enabledThreshold, items]);

  useEffect(() => {
    if (!active || !chunkingEnabled || renderedCount >= items.length) return;

    const id = window.requestAnimationFrame(() => {
      setRenderedCount((current) => Math.min(items.length, current + chunkSize));
    });

    return () => window.cancelAnimationFrame(id);
  }, [active, chunkSize, chunkingEnabled, items.length, renderedCount]);

  const cappedCount = chunkingEnabled ? Math.min(renderedCount, items.length) : items.length;

  const startIndex = Math.max(0, items.length - cappedCount);

  return {
    // Chat UIs should show the newest messages first on initial mount.
    // Older messages are prepended in later frames while normal DOM flow is kept.
    items: items.slice(startIndex),
    renderedCount: cappedCount,
    totalCount: items.length,
    done: cappedCount >= items.length,
  };
}
