"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Volume2, Mic, Square } from "lucide-react";

interface DialogueExchange {
  id: string;
  order_index: number;
  speaker: "app" | "student";
  english_text: string;
  portuguese_translation: string;
  audio_url: string | null;
}

interface LessonPlayerProps {
  lessonId: string;
  exchanges: DialogueExchange[];
}

type ProcessingPhase = "idle" | "uploading" | "transcribing" | "evaluating" | "complete" | "error";

type FeedbackResult = {
  is_correct: boolean;
  feedback_pt: string;
  transcription: string;
} | null;

const PHASE_LABELS: Record<ProcessingPhase, string> = {
  idle: "",
  uploading: "Enviando áudio...",
  transcribing: "Transcrevendo...",
  evaluating: "Avaliando sua fala...",
  complete: "Concluído!",
  error: "Erro",
};

/**
 * Returns the API base for browser fetches. We use a relative path so the
 * request goes to the same origin as the page (Next.js then rewrites it to
 * the API service — see web/next.config.ts). This keeps everything on a
 * single origin/protocol, which avoids mixed-content blocks when the app is
 * served over HTTPS (e.g. for mobile mic access over LAN).
 */
function getApiBaseUrl(): string {
  return "";
}

/**
 * Rewrites a backend-generated audio URL to a same-origin path so the
 * browser fetches it through Next.js (and avoids mixed-content + LAN host
 * issues). Backend stores URLs like `http://localhost:9000/audio/<key>`;
 * we rewrite that to `/audio/<key>`, which next.config.ts proxies to MinIO.
 */
function rewriteAudioUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // MinIO public URLs follow `<host>:9000/<bucket>/<key>`. Our bucket is
    // `audio`, so the pathname already starts with `/audio/...`. Strip the
    // host so the request becomes same-origin.
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/**
 * Picks the best MediaRecorder mimeType the current browser supports.
 * Order matters: prefer opus (best transcription quality, supported on
 * Chromium/Firefox), fall back to mp4/aac for iOS Safari which does not
 * support webm.
 */
function pickRecorderMime(): { mimeType?: string; extension: string } {
  if (typeof MediaRecorder === "undefined") return { extension: "webm" };
  const candidates: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) {
      return { mimeType: c.mime, extension: c.ext };
    }
  }
  // Browser will pick its own default; use a generic extension.
  return { extension: "webm" };
}

function ProcessingStatus({ phase }: { phase: ProcessingPhase }) {
  if (phase === "idle" || phase === "complete" || phase === "error") return null;

  const phases: ProcessingPhase[] = ["uploading", "transcribing", "evaluating"];
  const currentIndex = phases.indexOf(phase);

  return (
    <div className="border border-[#E5E5E5] p-5 mb-4">
      <div className="flex items-center gap-3">
        <div className="animate-spin h-5 w-5 border-2 border-[#DC2626] border-t-transparent" />
        <span className="font-sora text-sm font-medium text-[#000000]">
          {PHASE_LABELS[phase]}
        </span>
      </div>
      <div className="flex gap-2 mt-3">
        {phases.map((p, i) => (
          <div key={p} className="flex-1">
            <div
              className={`h-[3px] ${
                i <= currentIndex ? "bg-[#DC2626]" : "bg-[#E5E5E5]"
              }`}
            />
            <span className="font-mono text-[10px] text-[#999999] mt-1 block">
              {p === "uploading" ? "Enviar" : p === "transcribing" ? "Transcrever" : "Avaliar"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function LessonPlayer({ lessonId, exchanges }: LessonPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackResult>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>("idle");
  const [isCompleted, setIsCompleted] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [recordingExtension, setRecordingExtension] = useState<string>("webm");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const currentExchange = exchanges[currentIndex];
  const isAppTurn = currentExchange?.speaker === "app";
  const progress = `${currentIndex + 1}/${exchanges.length}`;
  const isProcessing = processingPhase !== "idle" && processingPhase !== "complete" && processingPhase !== "error";

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const playAudio = useCallback(async (url: string) => {
    if (!url) return;
    const playableUrl = rewriteAudioUrl(url);
    try {
      // Reuse a single audio element so a second tap stops the previous clip.
      let audio = audioPlayerRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = "none";
        // iOS Safari: required to play inline rather than open a full-screen player.
        audio.setAttribute("playsinline", "");
        audioPlayerRef.current = audio;
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
      audio.src = playableUrl;
      await audio.play();
    } catch (err) {
      console.error("[LessonPlayer] Audio playback failed:", err);
      alert(
        "Não foi possível reproduzir o áudio. Verifique se o servidor de áudio está acessível e tente novamente.\n\nCould not play audio. Check that the audio server is reachable from this device."
      );
    }
  }, []);

  const previewRecording = async () => {
    if (!audioBlob) return;
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    const audio = new Audio(URL.createObjectURL(audioBlob));
    audio.setAttribute("playsinline", "");
    audioPreviewRef.current = audio;
    try {
      await audio.play();
    } catch (err) {
      console.error("[LessonPlayer] Preview playback failed:", err);
    }
  };

  const startRecording = async () => {
    // getUserMedia requires a secure context (HTTPS) on non-localhost origins.
    // Detect this up front to give a clearer error.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      alert(
        "Para usar o microfone neste dispositivo, abra o app via HTTPS (ou pelo localhost).\n\nMicrophone access requires HTTPS or localhost. Open the app over HTTPS to record."
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Este navegador não suporta gravação de áudio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mimeType, extension } = pickRecorderMime();
      setRecordingExtension(extension);

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
      } catch (err) {
        console.warn("[LessonPlayer] MediaRecorder rejected options, retrying with defaults:", err);
        mediaRecorder = new MediaRecorder(stream);
      }

      chunksRef.current = [];
      setRecordingDuration(0);
      const startTime = Date.now();

      timerRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - startTime) / 1000);
      }, 100);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        // Use the recorder's reported mime (most accurate); fall back to our pick.
        const recorderMime = mediaRecorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recorderMime });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecordingDuration((Date.now() - startTime) / 1000);
      };

      // Use a 1s timeslice so iOS Safari emits chunks during recording rather
      // than only on stop — improves reliability of short clips.
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      console.error("[LessonPlayer] getUserMedia failed:", err);
      const name = (err as Error)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        alert(
          "Permissão de microfone negada. Habilite o microfone nas configurações do navegador.\n\nMicrophone permission denied. Enable it in your browser settings."
        );
      } else {
        alert("Erro ao acessar o microfone / Could not access microphone");
      }
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const submitAudio = async () => {
    if (!audioBlob || isProcessing) return;

    if (audioBlob.size === 0) {
      setFeedback({
        is_correct: false,
        feedback_pt: "A gravação está vazia. Tente novamente.",
        transcription: "",
      });
      return;
    }

    setFeedback(null);
    setProcessingPhase("uploading");

    console.log(
      `[LessonPlayer] Submitting audio. Size: ${audioBlob.size} bytes, type: ${audioBlob.type}, ext: ${recordingExtension}`
    );

    const formData = new FormData();
    formData.append("audio", audioBlob, `recording.${recordingExtension}`);
    formData.append("lesson_id", lessonId);
    formData.append("exchange_index", currentExchange.order_index.toString());
    formData.append("expected_text", currentExchange.english_text);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/speaking-tutor`, {
        method: "POST",
        body: formData,
      });

      console.log(`[LessonPlayer] Response status: ${res.status}`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        console.error("[LessonPlayer] API error:", data);
        throw new Error(data.error || "Erro no servidor");
      }

      setProcessingPhase("transcribing");
      await new Promise((r) => setTimeout(r, 500));

      setProcessingPhase("evaluating");
      const result = await res.json();
      console.log("[LessonPlayer] Result:", result);

      setProcessingPhase("complete");
      setFeedback(result);
      setRetryCount(0);
    } catch (err) {
      setProcessingPhase("error");
      const message = err instanceof Error ? err.message : "Erro de conexão";
      console.error("[LessonPlayer] Submit error:", message);
      setFeedback({
        is_correct: false,
        feedback_pt: `${message}. Tente novamente.`,
        transcription: "",
      });
    } finally {
      setTimeout(() => setProcessingPhase("idle"), 300);
    }
  };

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
    setFeedback(null);
    setAudioBlob(null);
  };

  const advance = () => {
    if (currentIndex < exchanges.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowTranslation(false);
      setFeedback(null);
      setAudioBlob(null);
      setRetryCount(0);
    } else {
      setIsCompleted(true);
      fetch(`${getApiBaseUrl()}/api/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: localStorage.getItem("cariockko_session"),
          lesson_id: lessonId,
          completed: true,
        }),
      }).catch(console.error);
    }
  };

  if (isCompleted) {
    return (
      <div className="flex flex-col items-center py-12 gap-4">
        <h2 className="font-sora text-2xl font-semibold tracking-[-1px] text-black">
          Parabéns!
        </h2>
        <p className="font-sora text-sm text-[#5E5E5E]">
          Você completou a lição / You completed the lesson!
        </p>
        <button
          onClick={() => window.history.back()}
          className="mt-4 px-6 py-3 min-h-[44px] bg-[#DC2626] text-[#FAFAFA] font-sora text-[12px] font-medium"
        >
          Voltar às lições
        </button>
      </div>
    );
  }

  if (!currentExchange) return null;

  // Shared button class strings for thumb-friendly tap targets on mobile.
  const btnBase = "min-h-[44px] font-sora text-[12px] font-medium inline-flex items-center justify-center";
  const btnPrimary = `${btnBase} px-4 py-3 bg-[#DC2626] text-[#FAFAFA]`;
  const btnSecondary = `${btnBase} px-4 py-3 border border-[#E5E5E5] text-black`;
  const btnSuccess = `${btnBase} px-4 py-3 bg-[#22C55E] text-[#FAFAFA]`;
  const btnDanger = `${btnBase} px-6 py-3 bg-[#991B1B] text-[#FAFAFA]`;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="font-mono text-xs text-[#5E5E5E]">{progress}</span>
        <div className="w-full sm:w-48 h-[4px] bg-[#E5E5E5]">
          <div
            className="h-full bg-[#DC2626]"
            style={{
              width: `${((currentIndex + 1) / exchanges.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {isAppTurn ? (
        <div className="border border-[#E5E5E5] p-4 md:p-8 flex flex-col gap-4">
          <span className="font-mono text-[12px] font-medium tracking-[1px] text-[#999999]">
            App
          </span>
          <p className="font-sora text-lg md:text-2xl font-semibold tracking-[-1px] text-black break-words">
            {currentExchange.english_text}
          </p>

          {showTranslation && (
            <p className="font-sora text-sm text-[#5E5E5E] break-words">
              {currentExchange.portuguese_translation}
            </p>
          )}

          <div className="flex flex-wrap gap-2 md:gap-3">
            {currentExchange.audio_url && (
              <button
                onClick={() => playAudio(currentExchange.audio_url!)}
                className={`${btnPrimary} gap-2`}
              >
                <Volume2 size={16} />
                Ouvir
              </button>
            )}
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className={btnSecondary}
            >
              {showTranslation ? "Ocultar" : "Tradução"}
            </button>
            <button onClick={advance} className={btnSuccess}>
              Próximo →
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-[#E5E5E5] p-4 md:p-8 flex flex-col gap-4">
          <span className="font-mono text-[12px] font-medium tracking-[1px] text-[#999999]">
            Sua vez / Your turn
          </span>
          <p className="font-sora text-lg md:text-2xl font-semibold tracking-[-1px] text-black break-words">
            {currentExchange.english_text}
          </p>

          {showTranslation && (
            <p className="font-sora text-sm text-[#5E5E5E] break-words">
              {currentExchange.portuguese_translation}
            </p>
          )}

          <div className="flex flex-wrap gap-2 md:gap-3">
            {currentExchange.audio_url && (
              <button
                onClick={() => playAudio(currentExchange.audio_url!)}
                className={`${btnPrimary} gap-2`}
              >
                <Volume2 size={16} />
                Ouvir referência
              </button>
            )}
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className={btnSecondary}
            >
              {showTranslation ? "Ocultar" : "Tradução"}
            </button>
          </div>

          <ProcessingStatus phase={processingPhase} />

          <div className="flex flex-wrap gap-2 md:gap-3 items-center">
            {!isRecording && !audioBlob && (
              <button
                onClick={startRecording}
                className={`${btnPrimary} gap-2 px-6`}
              >
                <Mic size={16} />
                Gravar
              </button>
            )}

            {isRecording && (
              <>
                <button
                  onClick={stopRecording}
                  className={`${btnDanger} gap-2`}
                >
                  <Square size={16} />
                  Parar
                </button>
                <span className="flex items-center gap-2 font-mono text-xs text-[#DC2626]">
                  <span className="w-3 h-3 bg-[#DC2626] animate-pulse" />
                  {formatDuration(recordingDuration)}
                </span>
              </>
            )}

            {audioBlob && !feedback && !isProcessing && (
              <>
                <button
                  onClick={submitAudio}
                  className={`${btnPrimary} px-6`}
                >
                  Enviar
                </button>
                <button
                  onClick={previewRecording}
                  className={`${btnSecondary} gap-2`}
                >
                  <Volume2 size={16} />
                  Ouvir gravação
                </button>
                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setRecordingDuration(0);
                  }}
                  className={btnSecondary}
                >
                  Regravar
                </button>
                {recordingDuration > 0 && (
                  <span className="font-mono text-xs text-[#999999]">
                    Duração: {formatDuration(recordingDuration)}
                  </span>
                )}
              </>
            )}
          </div>

          {feedback && (
            <div
              className={`p-5 flex flex-col gap-2 ${
                feedback.is_correct
                  ? "border-l-4 border-l-[#22C55E]"
                  : "border-l-4 border-l-[#DC2626]"
              }`}
            >
              {feedback.transcription && (
                <div>
                  <span className="font-mono text-[10px] tracking-[1px] text-[#999999] uppercase">
                    O que você disse:
                  </span>
                  <p className="font-sora text-sm text-[#000000] mt-1 break-words">
                    &ldquo;{feedback.transcription}&rdquo;
                  </p>
                </div>
              )}

              <p
                className={`font-sora text-sm font-medium break-words ${
                  feedback.is_correct ? "text-[#22C55E]" : "text-[#DC2626]"
                }`}
              >
                {feedback.feedback_pt}
              </p>

              {!feedback.is_correct && feedback.transcription && (
                <div className="pt-3 border-t border-[#E5E5E5]">
                  <span className="font-mono text-[10px] tracking-[1px] text-[#999999] uppercase">
                    O que era esperado:
                  </span>
                  <p className="font-sora text-sm text-[#000000] mt-1 break-words">
                    &ldquo;{currentExchange.english_text}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}

          {feedback && (
            <div className="flex flex-wrap gap-2 md:gap-3">
              <button
                onClick={() => {
                  if (feedback.is_correct) {
                    advance();
                  } else {
                    handleRetry();
                  }
                }}
                className={`${btnBase} px-6 py-3 text-[#FAFAFA] ${
                  feedback.is_correct ? "bg-[#22C55E]" : "bg-[#DC2626]"
                }`}
              >
                {feedback.is_correct ? "Próximo →" : "Tentar novamente"}
              </button>
              {!feedback.is_correct && retryCount > 0 && (
                <button onClick={advance} className={btnSecondary}>
                  Pular →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
