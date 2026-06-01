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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const PHASE_LABELS: Record<ProcessingPhase, string> = {
  idle: "",
  uploading: "Enviando áudio...",
  transcribing: "Transcrevendo...",
  evaluating: "Avaliando sua fala...",
  complete: "Concluído!",
  error: "Erro",
};

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

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
    };
  }, []);

  const playAudio = useCallback((url: string) => {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(console.error);
  }, []);

  const previewRecording = () => {
    if (!audioBlob) return;
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    const audio = new Audio(URL.createObjectURL(audioBlob));
    audioPreviewRef.current = audio;
    audio.play().catch(console.error);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

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
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecordingDuration((Date.now() - startTime) / 1000);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch {
      alert("Erro ao acessar o microfone / Could not access microphone");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const submitAudio = async () => {
    if (!audioBlob || isProcessing) return;

    setFeedback(null);
    setProcessingPhase("uploading");

    console.log(`[LessonPlayer] Submitting audio. Size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("lesson_id", lessonId);
    formData.append("exchange_index", currentExchange.order_index.toString());
    formData.append("expected_text", currentExchange.english_text);

    try {
      const res = await fetch(`${API_URL}/api/speaking-tutor`, {
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
      fetch(`${API_URL}/api/progress`, {
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
          className="mt-4 px-6 py-3 bg-[#DC2626] text-[#FAFAFA] font-sora text-[12px] font-medium"
        >
          Voltar às lições
        </button>
      </div>
    );
  }

  if (!currentExchange) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[#5E5E5E]">{progress}</span>
        <div className="w-48 h-[4px] bg-[#E5E5E5]">
          <div
            className="h-full bg-[#DC2626]"
            style={{
              width: `${((currentIndex + 1) / exchanges.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {isAppTurn ? (
        <div className="border border-[#E5E5E5] p-8 flex flex-col gap-4">
          <span className="font-mono text-[12px] font-medium tracking-[1px] text-[#999999]">
            App
          </span>
          <p className="font-sora text-2xl font-semibold tracking-[-1px] text-black">
            {currentExchange.english_text}
          </p>

          {showTranslation && (
            <p className="font-sora text-sm text-[#5E5E5E]">
              {currentExchange.portuguese_translation}
            </p>
          )}

          <div className="flex gap-3">
            {currentExchange.audio_url && (
              <button
                onClick={() => playAudio(currentExchange.audio_url!)}
                className="flex items-center gap-2 px-4 py-3 bg-[#DC2626] text-[#FAFAFA] font-sora text-[12px] font-medium"
              >
                <Volume2 size={16} />
                Ouvir
              </button>
            )}
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className="px-4 py-3 border border-[#E5E5E5] font-sora text-[12px] font-medium text-black"
            >
              {showTranslation ? "Ocultar" : "Tradução"}
            </button>
            <button
              onClick={advance}
              className="px-4 py-3 bg-[#22C55E] text-[#FAFAFA] font-sora text-[12px] font-medium"
            >
              Próximo →
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-[#E5E5E5] p-8 flex flex-col gap-4">
          <span className="font-mono text-[12px] font-medium tracking-[1px] text-[#999999]">
            Sua vez / Your turn
          </span>
          <p className="font-sora text-2xl font-semibold tracking-[-1px] text-black">
            {currentExchange.english_text}
          </p>

          {showTranslation && (
            <p className="font-sora text-sm text-[#5E5E5E]">
              {currentExchange.portuguese_translation}
            </p>
          )}

          <div className="flex gap-3">
            {currentExchange.audio_url && (
              <button
                onClick={() => playAudio(currentExchange.audio_url!)}
                className="flex items-center gap-2 px-4 py-3 bg-[#DC2626] text-[#FAFAFA] font-sora text-[12px] font-medium"
              >
                <Volume2 size={16} />
                Ouvir referência
              </button>
            )}
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className="px-4 py-3 border border-[#E5E5E5] font-sora text-[12px] font-medium text-black"
            >
              {showTranslation ? "Ocultar" : "Tradução"}
            </button>
          </div>

          <ProcessingStatus phase={processingPhase} />

          <div className="flex gap-3 items-center flex-wrap">
            {!isRecording && !audioBlob && (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 px-6 py-3 bg-[#DC2626] text-[#FAFAFA] font-sora text-[12px] font-medium"
              >
                <Mic size={16} />
                Gravar
              </button>
            )}

            {isRecording && (
              <>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-[#991B1B] text-[#FAFAFA] font-sora text-[12px] font-medium"
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
                  className="px-6 py-3 bg-[#DC2626] text-[#FAFAFA] font-sora text-[12px] font-medium"
                >
                  Enviar
                </button>
                <button
                  onClick={previewRecording}
                  className="flex items-center gap-2 px-4 py-3 border border-[#E5E5E5] font-sora text-[12px] font-medium text-black"
                >
                  <Volume2 size={16} />
                  Ouvir gravação
                </button>
                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setRecordingDuration(0);
                  }}
                  className="px-4 py-3 border border-[#E5E5E5] font-sora text-[12px] font-medium text-black"
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
                  <p className="font-sora text-sm text-[#000000] mt-1">
                    &ldquo;{feedback.transcription}&rdquo;
                  </p>
                </div>
              )}

              <p className={`font-sora text-sm font-medium ${feedback.is_correct ? "text-[#22C55E]" : "text-[#DC2626]"}`}>
                {feedback.feedback_pt}
              </p>

              {!feedback.is_correct && feedback.transcription && (
                <div className="pt-3 border-t border-[#E5E5E5]">
                  <span className="font-mono text-[10px] tracking-[1px] text-[#999999] uppercase">
                    O que era esperado:
                  </span>
                  <p className="font-sora text-sm text-[#000000] mt-1">
                    &ldquo;{currentExchange.english_text}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}

          {feedback && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (feedback.is_correct) {
                    advance();
                  } else {
                    handleRetry();
                  }
                }}
                className={`px-6 py-3 text-[#FAFAFA] font-sora text-[12px] font-medium ${
                  feedback.is_correct ? "bg-[#22C55E]" : "bg-[#DC2626]"
                }`}
              >
                {feedback.is_correct ? "Próximo →" : "Tentar novamente"}
              </button>
              {!feedback.is_correct && retryCount > 0 && (
                <button
                  onClick={advance}
                  className="px-4 py-3 border border-[#E5E5E5] font-sora text-[12px] font-medium text-black"
                >
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
