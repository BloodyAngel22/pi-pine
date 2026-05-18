import { useEffect, useRef, useState } from "react";

/**
 * Throttles frequently changing values for render-only subscriptions.
 * Useful for streaming text: incoming store updates can be faster than the UI
 * needs to repaint, while the latest value is still flushed on a fixed cadence.
 */
export function useThrottledValue<T>(value: T, intervalMs = 50): T {
  const [throttled, setThrottled] = useState(value);
  const latestRef = useRef(value);
  const timeoutRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);

  useEffect(() => {
    latestRef.current = value;
    const now = performance.now();
    const elapsed = now - lastFlushRef.current;

    const flush = () => {
      timeoutRef.current = null;
      lastFlushRef.current = performance.now();
      setThrottled(latestRef.current);
    };

    if (elapsed >= intervalMs) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      flush();
      return;
    }

    if (timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(flush, intervalMs - elapsed);
    }

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, intervalMs]);

  return throttled;
}
