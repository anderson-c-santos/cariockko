import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { pool } from "../lib/db.js";

export const SYSTEM_PROMPT = [
  "Você é o **Content Producer** do Cariockko, um aplicativo de aprendizado de inglês para brasileiros.",
  "",
  "# Seu papel",
  "Seu único objetivo é ajudar o usuário a **criar novas lições de inglês**. Você conversa com o usuário, entende o que ele quer aprender, e então apresenta um **Plano de Geração** estruturado. Você só cria lições depois que o usuário confirmar o plano.",
  "",
  "# Escopo (em)",
  "- Aceitar pedidos de criação de lições (com temas, níveis, quantidade).",
  "- Sugerir temas populares quando o usuário pedir algo genérico.",
  "- Pedir esclarecimentos curtos (nível, quantidade, tema) antes de propor o plano.",
  "- Sempre responder em **português brasileiro** (pt-BR).",
  "",
  "# Fora do escopo (guardrails) — RECUSE e redirecione",
  '- Perguntas de gramática ("o que é past perfect?", "explique present continuous").',
  '- Pedidos de tradução ("como se diz X em inglês?").',
  '- Pedidos genéricos que não sejam lições ("escreva um poema", "conte uma piada", "me ajude com redação").',
  "- Dúvidas sobre o app que não sejam criação de lições.",
  "- Qualquer pedido que não seja **criar uma lição de inglês**.",
  "",
  "Quando recusar, use exatamente este tom (varie levemente, mas mantenha a essência):",
  "> Eu estou aqui para te ajudar a **criar novas lições** no Cariockko. Para [motivo da recusa], o ideal é praticar com uma das suas lições existentes ou criar uma lição focada em [tema relacionado]. Quer que eu crie uma lição sobre isso?",
  "",
  'Em seguida, ofereça uma sugestão prática (ex.: "Posso criar 3 lições intermediárias sobre o tema X").',
  "",
  "# Como decidir se o plano está pronto",
  "Proponha o plano (ready: true) quando você tiver coletado:",
  "1. **Quantidade** de lições (sugira 3–10 por padrão; máximo absoluto 60 no total, 20 por nível).",
  "2. **Nível(is)**: beginner / intermediate / advanced (pode ser mais de um).",
  "3. **Tema(s)** dos diálogos (se o usuário não especificou, sugira 1–3 temas coerentes).",
  "",
  "Se ainda faltar algum desses, faça UMA pergunta curta e devolva ready: false.",
  "",
  "# Personagens (fixo)",
  "Sempre use Aimee (app) e Todd (student).",
  "",
  "# Formato da resposta",
  "Responda SEMPRE como JSON válido, sem markdown, sem comentários.",
].join("\n");

export const PlanLessonSchema = z.object({
  level: z.enum(["beginner", "intermediate", "advanced"]),
  theme: z.string().min(1),
  count: z.number().int().min(1).max(20),
});

export const PlanSchema = z.object({
  ready: z.boolean(),
  reply: z.string().default(""),
  plan: z
    .object({
      lessons: z.array(PlanLessonSchema).min(1).max(20),
      characters: z
        .object({
          app: z.string().min(1),
          student: z.string().min(1),
        })
        .default({ app: "Aimee", student: "Todd" }),
      estimatedMinutes: z.number().int().min(1).max(60),
    })
    .optional(),
  guardrail: z
    .object({
      triggered: z.literal(true),
      suggestedTopic: z.string().optional(),
    })
    .optional(),
});

export type Plan = z.infer<typeof PlanSchema>;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  plan?: Plan["plan"];
  guardrail?: Plan["guardrail"];
}

export interface ChatTurnResult {
  reply: string;
  plan?: Plan["plan"];
  guardrail?: Plan["guardrail"];
  raw: Plan;
}

interface PersistedSession {
  session_id: string;
  messages: ChatMessage[];
}

const MAX_HISTORY = 30;

async function loadSession(sessionId: string): Promise<PersistedSession | null> {
  const { rows } = await pool.query<{ session_id: string; messages: ChatMessage[] }>(
    "SELECT session_id, messages FROM content_producer_sessions WHERE session_id = $1",
    [sessionId]
  );
  return rows[0] ?? null;
}

async function saveSession(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY);
  await pool.query(
    `INSERT INTO content_producer_sessions (session_id, messages, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (session_id)
     DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()`,
    [sessionId, JSON.stringify(trimmed)]
  );
}

/**
 * Builds the LLM call config. Exported so tests can patch the model and
 * inspect the messages that would be sent.
 */
export function buildChatModel() {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini",
    temperature: 0.4,
  }).withStructuredOutput(PlanSchema, { name: "ContentProducerResponse" });
}

/**
 * Heuristic pre-filter for the most obvious out-of-scope patterns. This is
 * intentionally conservative — when in doubt, defer to the model.
 */
const GUARDRAIL_KEYWORDS = [
  /explique (a )?gram[aá]tica/i,
  /o que [eé] (past|present|future|o)/i,
  /como se diz .* em ingl[eê]s/i,
  /traduza? .* para ingl[eê]s/i,
  /escreva um poema/i,
  /conte uma piada/i,
  /me ajude com (redação|texto|essay)/i,
];

export function detectGuardrailHeuristic(message: string): boolean {
  return GUARDRAIL_KEYWORDS.some((re) => re.test(message));
}

function asHistory(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((m) => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content,
  }));
}

export interface ChatOptions {
  sessionId: string;
  message: string;
  llmFactory?: () => ReturnType<typeof buildChatModel>;
}

/**
 * Send a user message in the context of the persisted conversation and
 * return the agent's structured reply.
 */
export async function chat(options: ChatOptions): Promise<ChatTurnResult> {
  const { sessionId, message, llmFactory } = options;

  const existing = await loadSession(sessionId);
  const history: ChatMessage[] = existing?.messages ?? [];

  // Run the LLM with current history + the new user message.
  const llm = llmFactory ? llmFactory() : buildChatModel();
  const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...asHistory(history),
    { role: "user", content: message },
  ];

  const raw = (await llm.invoke(llmMessages)) as Plan;
  const validated = PlanSchema.parse(raw);

  // If the heuristic flagged the message as obviously out-of-scope and the
  // model didn't trip its own guardrail, force one to keep behaviour
  // predictable in obvious cases (cheap belt-and-braces).
  const heuristic = detectGuardrailHeuristic(message);
  const finalPlan: Plan = {
    ...validated,
    guardrail:
      validated.guardrail ?? (heuristic ? { triggered: true } : undefined),
  };

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: finalPlan.reply,
    plan: finalPlan.plan,
    guardrail: finalPlan.guardrail,
  };

  const nextHistory: ChatMessage[] = [
    ...history,
    { role: "user", content: message },
    assistantMessage,
  ];
  await saveSession(sessionId, nextHistory);

  return {
    reply: finalPlan.reply,
    plan: finalPlan.plan,
    guardrail: finalPlan.guardrail,
    raw: finalPlan,
  };
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const session = await loadSession(sessionId);
  return session?.messages ?? [];
}

export async function clearSession(sessionId: string): Promise<void> {
  await pool.query("DELETE FROM content_producer_sessions WHERE session_id = $1", [
    sessionId,
  ]);
}
