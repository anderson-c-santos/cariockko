import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import { toFile } from "openai";

const openai = new OpenAI();

interface DialogueLine {
  order_index: number;
  speaker: string;
  english_text: string;
  portuguese_translation: string;
}

interface SpeakingTutorInput {
  audioBuffer: Buffer;
  lessonContext: DialogueLine[];
  expectedText: string;
  exchangeIndex: number;
}

interface TutorFeedback {
  is_correct: boolean;
  feedback_pt: string;
  transcription: string;
}

export async function speakingTutorAgent(
  input: SpeakingTutorInput
): Promise<TutorFeedback> {
  console.log(`[speaking-tutor] Starting analysis. Buffer size: ${input.audioBuffer.length} bytes, Expected: "${input.expectedText}"`);

  if (!input.audioBuffer || input.audioBuffer.length === 0) {
    console.error("[speaking-tutor] Empty audio buffer received");
    return {
      is_correct: false,
      feedback_pt: "Erro: áudio vazio. Tente gravar novamente.",
      transcription: "",
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("[speaking-tutor] OPENAI_API_KEY not set");
    return {
      is_correct: false,
      feedback_pt: "Erro de configuração do servidor. Contate o suporte.",
      transcription: "",
    };
  }

  let transcription: string;
  try {
    transcription = await transcribeWithRetry(input.audioBuffer);
    console.log(`[speaking-tutor] Transcription result: "${transcription}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown transcription error";
    console.error(`[speaking-tutor] Transcription failed: ${message}`, err);
    return {
      is_correct: false,
      feedback_pt: "Erro ao transcrever áudio. Tente falar mais alto e claro.",
      transcription: "",
    };
  }

  if (!transcription || transcription.trim().length === 0) {
    console.log("[speaking-tutor] Empty transcription, audio unclear");
    return {
      is_correct: false,
      feedback_pt: "Não consegui entender o áudio. Tente falar mais alto e claro.",
      transcription: "",
    };
  }

  let feedback: TutorFeedback;
  try {
    feedback = await evaluateSpeech(
      input.lessonContext,
      input.expectedText,
      transcription
    );
    console.log(`[speaking-tutor] Evaluation result: correct=${feedback.is_correct}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown evaluation error";
    console.error(`[speaking-tutor] Evaluation failed: ${message}`, err);
    return {
      is_correct: false,
      feedback_pt: "Erro ao avaliar fala. Tente novamente.",
      transcription,
    };
  }

  return { ...feedback, transcription };
}

async function transcribeWithRetry(buffer: Buffer, maxRetries = 2): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[speaking-tutor] Transcription attempt ${attempt + 1}/${maxRetries + 1}`);
      const file = await toFile(buffer, "audio.webm", { type: "audio/webm" });
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });
      return transcription.text;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[speaking-tutor] Transcription attempt ${attempt + 1} failed: ${message}`);
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return "";
}

async function evaluateSpeech(
  context: DialogueLine[],
  expectedText: string,
  transcription: string
): Promise<TutorFeedback> {
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini",
    temperature: 0.3,
  });

  const contextText = context
    .map((l) => `${l.speaker}: ${l.english_text}`)
    .join("\n");

  const response = await llm.invoke([
    {
      role: "system",
      content: `You are a friendly English-speaking tutor for Brazilian students. 
Analyze the student's spoken English against the expected line in a dialogue.

Return ONLY a JSON object with this exact format:
{
  "is_correct": boolean,
  "feedback_pt": "feedback in Brazilian Portuguese"
}

Rules:
- is_correct = true if the student said essentially the same meaning as expected, even with minor pronunciation issues
- is_correct = false if the student said wrong words, missing key words, or completely different meaning
- feedback_pt should be encouraging, in Brazilian Portuguese
- If correct: congratulate briefly
- If incorrect: mention what went wrong and encourage retry`
    },
    {
      role: "user",
      content: `Dialogue context:
${contextText}

Expected line the student should say:
"${expectedText}"

What the student actually said:
"${transcription}"

Analyze and return JSON feedback.`
    }
  ]);

  const content = response.content as string;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      is_correct: false,
      feedback_pt: "Não consegui analisar o áudio. Tente novamente.",
      transcription,
    };
  }

  return JSON.parse(jsonMatch[0]) as TutorFeedback;
}
