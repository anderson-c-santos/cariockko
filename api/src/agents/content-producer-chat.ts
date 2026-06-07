import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { pool } from "../lib/db.js";

export const SYSTEM_PROMPT = [
  "Você é o **Content Producer** do Cariockko, um aplicativo de aprendizado de inglês para brasileiros.",
  "",
  "# Seu papel",
  "Seu único objetivo é ajudar o usuário a **criar novas lições de inglês**. Você conversa com o usuário, entende o que ele quer aprender, e então apresenta um **Plano de Geração** estruturado. Você só cria lições depois que o usuário confirmar o plano.",
  "",
  "# O que é pedido de lição (SEMPRE aceite)",
  "Qualquer mensagem que mencione criar, gerar, produzir ou montar lições é um pedido de lição. Exemplos:",
  '- "Gere lições genéricas para mim" → aceite, sugira temas e níveis.',
  '- "Quero criar 5 lições sobre viagens" → aceite diretamente.',
  '- "apenas crie as licoes genericas" → aceite, proponha um plano com defaults.',
  '- "Me faz umas lições de intermediário" → aceite, proponha temas.',
  "NÃO acione o guardrail para pedidos de lições. O guardrail é SOMENTE para coisas que NÃO são criar lições.",
  "",
  "# Guardrail — SOMENTE para conteúdo fora do escopo",
  "Acione o guardrail APENAS quando o pedido não tiver NENHUMA relação com criar lições de inglês:",
  '- Perguntas de gramática ("o que é past perfect?", "explique present continuous").',
  '- Pedidos de tradução ("como se diz X em inglês?").',
  '- Pedidos que não são lições ("escreva um poema", "conte uma piada", "me ajude com redação").',
  '- Dúvidas sobre o app que não sejam criação de lições.',
  "",
  "# Como decidir o plano",
  "Quando o usuário pedir lições genéricas sem especificar detalhes, use SENSATO DEFAULTS:",
  "- Proponha lições com cenários concretos do dia a dia.",
  "- Prefira 3 a 5 lições com temas distintos em vez de repetir o mesmo tema.",
  "- Mantenha um único tema central por plano e derive variações desse mesmo contexto.",
  "- Se o usuário trouxer um tema específico, preserve esse tema e expanda em subcontextos relacionados.",
  "- Cada item do plano representa uma única lição; use count: 1 em cada item.",
  "- Proponha o plano imediatamente com ready: true.",
  "Só peça mais informações se o pedido for ambíguo demais para sugerir defaults razoáveis.",
  "",
  "# Personagens (fixo)",
  "Sempre use Aimee (app) e Todd (student).",
  "",
  "# Formato da resposta",
  "Responda SEMPRE em português brasileiro. A estrutura da resposta é controlada automaticamente — não precisa se preocupar com formatação.",
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
    .nullable()
    .optional(),
  guardrail: z
    .object({
      triggered: z.literal(true),
      suggestedTopic: z.string().optional(),
    })
    .nullable()
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
  // Filter out system messages — the agent prepends its own system prompt.
  // For assistant messages that included a plan, we prepend a structured
  // summary so the LLM retains context about what it already proposed.
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      let content = m.content;
      if (m.role === "assistant" && m.plan) {
        const planSummary = m.plan.lessons
          .map((l) => `${l.count}x ${l.level} "${l.theme}"`)
          .join(", ");
        content = `[Plano já proposto: ${planSummary}] ${content}`;
      }
      return { role: m.role as "user" | "assistant", content };
    });
}

function summarizePlan(plan: NonNullable<Plan["plan"]>): string {
  const totalLessons = plan.lessons.reduce((sum, lesson) => sum + lesson.count, 0);
  const topics = plan.lessons.map((lesson) => lesson.theme).join(", ");
  return `Perfeito. Montei um plano com ${totalLessons} lições sobre ${topics}. Se quiser editar, me diga o que mudar: nível, tema, quantidade ou contexto.`;
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
  const parsed = PlanSchema.safeParse(raw);

  let validated: Plan;
  if (parsed.success) {
    validated = parsed.data;
  } else {
    // If structured output parsing fails, fall back to a minimal valid
    // plan so the conversation doesn't break. Log for debugging.
    console.error("[content-producer] PlanSchema parse failed:", parsed.error.format());
    validated = {
      ready: false,
      reply: typeof raw === "object" && raw !== null && "reply" in raw
        ? String((raw as Record<string, unknown>).reply ?? "")
        : "Desculpe, tive um problema ao processar sua mensagem. Pode repetir?",
      plan: null,
      guardrail: null,
    };
  }

  // If the heuristic flagged the message as obviously out-of-scope and the
  // model didn't trip its own guardrail, force one to keep behaviour
  // predictable in obvious cases (cheap belt-and-braces).
  const heuristic = detectGuardrailHeuristic(message);

  // Defensive: if the user is clearly asking to create lessons but the
  // LLM incorrectly triggered the guardrail, override it.
  const LESSON_KEYWORDS = /li[cç][aã]o|li[cç][oõ]es|aula|aulas|gerar|criar|crie|montar|produzir/i;
  const userWantsLessons = LESSON_KEYWORDS.test(message);
  const guardrailOverridden = userWantsLessons && validated.guardrail;

  const finalPlan: Plan = {
    ...validated,
    // When we override the guardrail, the reply text is likely the
    // refusal template — replace it with a helpful response.
    reply: guardrailOverridden
      ? "Claro! Vou montar um plano de lições para você. Aqui está uma sugestão:"
      : validated.reply,
    guardrail:
      guardrailOverridden
        ? undefined  // Override false-positive guardrail
      : validated.guardrail ?? (heuristic ? { triggered: true } : undefined),
    plan: validated.plan,
  };

  const coherentPlan = finalPlan.plan ?? undefined;
  const reply =
    finalPlan.reply.trim() ||
    (coherentPlan
      ? summarizePlan(coherentPlan)
      : "Claro. Me diga como você quer seguir com as lições.");

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: reply,
    plan: coherentPlan,
    guardrail: finalPlan.guardrail,
  };

  const nextHistory: ChatMessage[] = [
    ...history,
    { role: "user", content: message },
    assistantMessage,
  ];
  await saveSession(sessionId, nextHistory);

  return {
    reply,
    plan: coherentPlan,
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
