import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { onTerminalData, resizeTerminal, writeTerminal } from "@/terminal";

interface Props {
  id: string;
  active: boolean;
  onReady?: (id: string, term: Terminal) => void;
}

export function TerminalView({ id, active, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let term: Terminal;
    let fit: FitAddon;
    try {
      setError(null);
      term = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        customGlyphs: true,
        fontFamily: '"MesloLGS NF", "MesloLGS Nerd Font Mono", "JetBrainsMono Nerd Font Mono", "JetBrains Mono NL", "JetBrains Mono", "Symbols Nerd Font Mono", ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: 12,
        letterSpacing: 0,
        lineHeight: 1.15,
        theme: {
          background: "#0a0a0a",
          foreground: "#ededed",
          cursor: "#ededed",
          selectionBackground: "#2c3a5a",
          black: "#0a0a0a",
          red: "#f7768e",
          green: "#9ece6a",
          yellow: "#e0af68",
          blue: "#7aa2f7",
          magenta: "#bb9af7",
          cyan: "#2ac3de",
          white: "#ededed",
          brightBlack: "#6b6b6b",
          brightRed: "#f7768e",
          brightGreen: "#9ece6a",
          brightYellow: "#e0af68",
          brightBlue: "#7aa2f7",
          brightMagenta: "#bb9af7",
          brightCyan: "#2ac3de",
          brightWhite: "#ffffff",
        },
      });
      fit = new FitAddon();
      term.loadAddon(new Unicode11Addon());
      term.unicode.activeVersion = "11";
      term.loadAddon(fit);
      term.open(host);
      term.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    termRef.current = term;
    fitRef.current = fit;
    onReady?.(id, term);
    let lastSize = { cols: term.cols, rows: term.rows };
    let fitTimer: number | null = null;

    const fitAndResize = () => {
      if (fitTimer != null) window.clearTimeout(fitTimer);
      fitTimer = window.setTimeout(() => {
        fitTimer = null;
        try {
          if (host.offsetWidth === 0 || host.offsetHeight === 0) return;
          fit.fit();
          if (term.cols === lastSize.cols && term.rows === lastSize.rows) return;
          lastSize = { cols: term.cols, rows: term.rows };
          void resizeTerminal(id, term.cols, term.rows);
        } catch {}
      }, 25);
    };

    const fitNow = () => {
      try {
        if (host.offsetWidth === 0 || host.offsetHeight === 0) return;
        fit.fit();
        lastSize = { cols: term.cols, rows: term.rows };
        void resizeTerminal(id, term.cols, term.rows);
      } catch {}
    };

    const inputDisposable = term.onData((data: string) => {
      void writeTerminal(id, data);
    });
    const resizeDisposable = term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      void resizeTerminal(id, cols, rows);
    });

    const ro = new ResizeObserver(fitAndResize);
    ro.observe(host);
    window.setTimeout(fitNow, 0);

    let unlisten: (() => void) | null = null;
    onTerminalData((event) => {
      if (event.id === id) term.write(event.data);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
      if (fitTimer != null) window.clearTimeout(fitTimer);
      ro.disconnect();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id, onReady]);

  useEffect(() => {
    if (!active) return;
    window.setTimeout(() => {
      try {
        termRef.current?.focus();
        const term = termRef.current;
        fitRef.current?.fit();
        if (term) {
          void resizeTerminal(id, term.cols, term.rows);
          window.setTimeout(() => {
            try {
              fitRef.current?.fit();
              if (termRef.current) void resizeTerminal(id, termRef.current.cols, termRef.current.rows);
            } catch {}
          }, 100);
        }
      } catch {}
    }, 0);
  }, [active, id]);

  return (
    <div className={active ? "h-full w-full" : "hidden"}>
      {error && (
        <div className="h-full w-full flex items-center justify-center bg-black p-4 text-xs text-(--color-danger)">
          Не удалось открыть xterm: {error}
        </div>
      )}
      <div ref={hostRef} className={error ? "hidden" : "h-full w-full"} />
    </div>
  );
}
