import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { Mic, MicOff, Loader2 } from "@/components/ui/icons/compat";
import { useChat } from "@/store/chat";
import { t } from "@/i18n/ru";

/** Автостоп записи — защита от случайной бесконечной записи (5 минут). */
const MAX_RECORDING_MS = 5 * 60 * 1000;

export type RecordingState = "idle" | "recording" | "transcribing" | "error";

interface TranscriptionResult {
  text: string;
  no_speech_detected: boolean;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Кодирует Blob в base64 чанками — быстрее, чем побайтовая конкатенация строк. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

export function VoiceRecordButton({ onStateChange }: { onStateChange?(state: RecordingState): void }) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }

  function showError(message: string) {
    setErrorMsg(message);
    setState("error");
    window.setTimeout(() => {
      setErrorMsg((cur) => (cur === message ? null : cur));
      setState((cur) => (cur === "error" ? "idle" : cur));
    }, 4000);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showError(t.voice.micUnsupported);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showError(t.voice.micDenied);
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => void handleRecordingStop();

    recorder.start();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setState("recording");

    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    autoStopRef.current = window.setTimeout(() => stopRecording(), MAX_RECORDING_MS);
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    stopTracks();
  }

  async function handleRecordingStop() {
    setState("transcribing");
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    try {
      const audioBase64 = await blobToBase64(blob);
      const result = await invoke<TranscriptionResult>("transcribe_audio", {
        audioBase64,
        mimeType,
      });
      if (result.no_speech_detected || !result.text.trim()) {
        showError(t.voice.noSpeechDetected);
        return;
      }
      useChat.getState().injectComposer(result.text);
      setState("idle");
    } catch (e) {
      const message = typeof e === "string" ? e : e instanceof Error ? e.message : t.voice.genericError;
      showError(message || t.voice.genericError);
    }
  }

  const onClick = () => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle" || state === "error") {
      void startRecording();
    }
  };

  const disabled = state === "transcribing";

  return (
    <div className="flex items-center gap-1.5">
      {state === "recording" && (
        <span className="text-[11px] font-mono text-(--color-danger)">{formatElapsed(elapsedMs)}</span>
      )}
      {state === "error" && errorMsg && (
        <span className="max-w-[220px] truncate text-[11px] text-(--color-danger)" title={errorMsg}>
          {errorMsg}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={state === "recording" ? t.voice.stop : t.voice.record}
        className={clsx(
          "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
          state === "recording"
            ? "bg-(--color-danger) text-white shadow-[0_10px_22px_-12px_var(--color-danger)] animate-pulse"
            : state === "transcribing"
              ? "bg-(--color-accent-soft) text-(--color-accent)"
              : state === "error"
                ? "bg-(--color-danger)/15 text-(--color-danger)"
                : "bg-(--color-bg-mute) text-(--color-fg-mute) hover:text-(--color-fg)",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        {state === "transcribing" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : state === "error" ? (
          <MicOff size={16} />
        ) : (
          <Mic size={16} />
        )}
      </button>
    </div>
  );
}
