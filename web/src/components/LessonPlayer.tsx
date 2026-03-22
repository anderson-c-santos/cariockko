"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
        <span className="text-blue-800 font-medium">{PHASE_LABELS[phase]}</span>
      </div>
      <div className="flex gap-2 mt-3">
        {phases.map((p, i) => (
          <div key={p} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-all ${
                i <= currentIndex ? "bg-blue-500" : "bg-blue-200"
              }`}
            />
            <span className="text-xs text-gray-500 mt-1 block">
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
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold mb-2">Parabéns!</h2>
        <p className="text-gray-600 mb-6">
          Você completou a lição / You completed the lesson!
        </p>
        <a
          href="/lessons"
          className="text-blue-600 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            window.history.back();
          }}
        >
          Voltar às lições / Back to lessons
        </a>
      </div>
    );
  }

  if (!currentExchange) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500">{progress}</span>
        <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{
              width: `${((currentIndex + 1) / exchanges.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {isAppTurn ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="text-sm text-gray-500 mb-2">App</div>
          <p className="text-xl font-medium mb-4">
            {currentExchange.english_text}
          </p>

          {showTranslation && (
            <p className="text-gray-600 mb-4 italic">
              {currentExchange.portuguese_translation}
            </p>
          )}

          <div className="flex gap-3">
            {currentExchange.audio_url && (
              <button
                onClick={() => playAudio(currentExchange.audio_url!)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                🔊 Ouvir
              </button>
            )}
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              {showTranslation ? "Ocultar" : "Tradução"}
            </button>
            <button
              onClick={advance}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              Próximo →
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="text-sm text-gray-500 mb-2">Sua vez / Your turn</div>
          <p className="text-xl font-medium mb-4">
            {currentExchange.english_text}
          </p>

          {showTranslation && (
            <p className="text-gray-600 mb-4 italic">
              {currentExchange.portuguese_translation}
            </p>
          )}

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              {showTranslation ? "Ocultar" : "Tradução"}
            </button>
          </div>

          <ProcessingStatus phase={processingPhase} />

          <div className="flex gap-3 mb-4 items-center flex-wrap">
            {!isRecording && !audioBlob && (
              <button
                onClick={startRecording}
                className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 text-lg"
              >
                🎤 Gravar
              </button>
            )}

            {isRecording && (
              <>
                <button
                  onClick={stopRecording}
                  className="px-6 py-3 bg-red-700 text-white rounded-lg hover:bg-red-800 text-lg"
                >
                  ⏹ Parar
                </button>
                <span className="flex items-center gap-2 text-red-600 font-mono">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  {formatDuration(recordingDuration)}
                </span>
              </>
            )}

            {audioBlob && !feedback && !isProcessing && (
              <>
                <button
                  onClick={submitAudio}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Enviar
                </button>
                <button
                  onClick={previewRecording}
                  className="px-4 py-3 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  🔊 Ouvir gravação
                </button>
                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setRecordingDuration(0);
                  }}
                  className="px-4 py-3 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Regravar
                </button>
                {recordingDuration > 0 && (
                  <span className="text-sm text-gray-500">
                    Duração: {formatDuration(recordingDuration)}
                  </span>
                )}
              </>
            )}
          </div>

          {feedback && (
            <div
              className={`p-4 rounded-lg mb-4 ${
                feedback.is_correct
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <div className="text-lg mb-1">
                {feedback.is_correct ? "✅" : "❌"}
              </div>

              {feedback.transcription && (
                <div className="mb-3">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                    O que você disse:
                  </span>
                  <p className="text-gray-700 italic mt-1">
                    &ldquo;{feedback.transcription}&rdquo;
                  </p>
                </div>
              )}

              <p
                className={
                  feedback.is_correct ? "text-green-800" : "text-red-800"
                }
              >
                {feedback.feedback_pt}
              </p>

              {!feedback.is_correct && feedback.transcription && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                    O que era esperado:
                  </span>
                  <p className="text-gray-700 mt-1">
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
                className={`px-6 py-3 rounded-lg text-white ${
                  feedback.is_correct
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {feedback.is_correct ? "Próximo →" : "Tentar novamente"}
              </button>
              {!feedback.is_correct && retryCount > 0 && (
                <button
                  onClick={advance}
                  className="px-4 py-3 bg-gray-200 rounded-lg hover:bg-gray-300"
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
