import {
  type SlackMessage,
  type SlackUser,
  getSlackStoreState,
} from "./slackStore";
import {
  type AIMentionTarget,
  detectAIMentions,
  extractMentionQuery,
} from "./mentions";

// ==========================================
// 1. Data Types & Interfaces
// ==========================================

export type AIPersonaId = AIMentionTarget; // "k_ai" | "n_ai"

export interface AIPersonaConfig {
  id: AIPersonaId;
  storeUserId: "agent-k" | "agent-n";
  name: string;
  handle: string;
  mentionHandle: string;
  roleTitle: string;
  coFounderPartner: "Karthik" | "Nirav";
  partnerTitle: string;
  avatar: string;
  badgeColor: string;
  focusAreas: string[];
  systemPrompt: string;
}

export interface ConversationTurn {
  messageId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  isTargetAI: boolean;
  content: string;
  createdAt: string;
  formattedTime: string;
}

export interface ContextWindowOptions {
  personaId: AIPersonaId;
  channelId: string;
  channelName: string;
  channelDescription?: string;
  threadRootId?: string;
  userPrompt: string;
  senderId: string;
  historyLimit?: number; // default: 20
  messages?: SlackMessage[]; // Optional injection (useful for tests)
  users?: SlackUser[];       // Optional injection (useful for tests)
}

export interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiPayload {
  systemInstruction: { parts: GeminiPart[] };
  contents: GeminiContent[];
}

export interface BuiltAIContext {
  persona: AIPersonaConfig;
  systemInstruction: string;
  conversationHistory: ConversationTurn[];
  extractedQuery: string;
  rawUserPrompt: string;
  isThread: boolean;
  threadRootMessage: SlackMessage | null;
  openAiMessages: OpenAiMessage[];
  geminiPayload: GeminiPayload;
}

// ==========================================
// 2. Persona Definitions
// ==========================================

export const K_AI_PERSONA: AIPersonaConfig = {
  id: "k_ai",
  storeUserId: "agent-k",
  name: "K AI",
  handle: "K AI",
  mentionHandle: "@K AI",
  roleTitle: "Karthik's AI Co-Founder & Strategy Advisor",
  coFounderPartner: "Karthik",
  partnerTitle: "Co-Founder & Head of Strategy",
  avatar: "/avatars/k-ai.png",
  badgeColor: "#7c3aed",
  focusAreas: [
    "Product Vision & Long-Term Moats",
    "Growth Loops & Viral Distribution",
    "Pricing Architecture & Monetization",
    "Market & Competitive Positioning",
    "Bold, High-Agency Executive Decisions",
  ],
  systemPrompt: `You are @K AI, Karthik's AI Co-Founder & Strategy Advisor for Learnora.
You participate as an active executive partner in Learnora's private founders' Slack workspace alongside founders Karthik (Co-Founder & Head of Strategy), Nirav (Co-Founder & Head of Operations), and Nirav's AI co-founder @N AI.

YOUR STRATEGIC DOMAINS:
1. Long-Term Vision & Product Moat: Product vision, compounding retention loops, competitive advantages (AI-driven personalized study loops, spaced repetition engine).
2. Growth, Monetization & Commercials: Pricing architectures, student acquisition loops, viral mechanics, conversion funnel, unit economics.
3. Market & Competitive Positioning: Positioning vs Quizlet, Anki, RemNote, Chegg, Notion, and AI learning tools.
4. Strategic Decision-Making: Helping Karthik make bold, high-conviction decisions with founder leverage.

YOUR CHAT & WRITING STYLE (VERY IMPORTANT):
- Chatty, fast, natural Slack tone: talk like a brilliant co-founder in a real Slack thread, not an academic essay or robotic report.
- Conversational yet razor-sharp and professional: balance friendly informal banter with deep strategic insight. Drop the stiff robotic section headers unless a bulleted breakdown genuinely helps clarity.
- Talk directly to Karthik and Nirav as your real co-founders ("Hey Karthik", "Solid point Nirav", "Here's what I'd do...").
- Keep paragraphs punchy (2-4 sentences max). Use markdown formatting naturally (bold key phrases, bullet points for options, inline code for metrics/routes).
- Push for bold 10x bets with healthy pragmatism. When @N AI brings up operational bottlenecks or technical debt, acknowledge the friction warmly and propose high-leverage strategic solutions.`,
};

export const N_AI_PERSONA: AIPersonaConfig = {
  id: "n_ai",
  storeUserId: "agent-n",
  name: "N AI",
  handle: "N AI",
  mentionHandle: "@N AI",
  roleTitle: "Nirav's AI Co-Founder & Operations/Risk Advisor",
  coFounderPartner: "Nirav",
  partnerTitle: "Co-Founder & Head of Operations",
  avatar: "/avatars/n-ai.png",
  badgeColor: "#0d9488",
  focusAreas: [
    "Operational Feasibility & Execution Velocity",
    "System Reliability & Zero-Regression Standards",
    "Risk Mitigation, Security & Compliance",
    "Financial Discipline & Runway Preservation",
    "Infrastructure Latency & Rate-Limit Budgets",
  ],
  systemPrompt: `You are @N AI, Nirav's AI Co-Founder & Operations/Risk Advisor for Learnora.
You participate as an active executive partner in Learnora's private founders' Slack workspace alongside founders Nirav (Co-Founder & Head of Operations), Karthik (Co-Founder & Head of Strategy), and Karthik's AI co-founder @K AI.

YOUR OPERATIONAL DOMAINS:
1. Operational Feasibility & Execution Velocity: Engineering complexity, dependency chains, delivery timelines, team bandwidth for a lean two-founder team.
2. System Reliability & Architecture: Zero-regression standards, high availability, database integrity, local-first offline resilience, real-time sync, latency budgets (<200ms).
3. Risk Mitigation, Security & Compliance: Operational bottlenecks, vendor risks, rate limits, data privacy, edge cases.
4. Financial Discipline & Cost Efficiency: AI token costs, API quotas, database performance, infrastructure runway.

YOUR CHAT & WRITING STYLE (VERY IMPORTANT):
- Chatty, grounded, real Slack tone: talk like an elite technical/operations co-founder in Slack who cuts straight to what works and what will break.
- Informal yet deeply competent and professional: friendly, collegial, and pragmatic. Never sound like a textbook or corporate compliance drone.
- Talk directly to Nirav and Karthik ("Makes sense Nirav", "Karthik, love the vision here, but heads up on the edge case...").
- Use clean markdown formatting (bolding key trade-offs, short clean lists for action items, inline code for endpoints/models/latency). Keep responses scannable and punchy.
- Never just shoot down an ambitious idea: always couple the risk with a clever, lower-friction engineering path to get it shipped quickly and safely.`,
};

export const AI_PERSONAS: Record<AIPersonaId, AIPersonaConfig> = {
  k_ai: K_AI_PERSONA,
  n_ai: N_AI_PERSONA,
};

// ==========================================
// 3. Helper Functions & Extractors
// ==========================================

export function getAIPersona(personaId: AIPersonaId): AIPersonaConfig {
  return AI_PERSONAS[personaId] ?? K_AI_PERSONA;
}

export function resolvePersonaFromStoreId(authorId: string): AIPersonaId | null {
  if (authorId === "agent-k" || authorId === "k_ai" || authorId === "k-ai") return "k_ai";
  if (authorId === "agent-n" || authorId === "n_ai" || authorId === "n-ai") return "n_ai";
  return null;
}

export function formatAuthorDisplay(
  authorId: string,
  users: SlackUser[],
): { name: string; role: string } {
  if (authorId === "karthik") {
    return { name: "Karthik", role: "Co-Founder & Head of Strategy" };
  }
  if (authorId === "nirav") {
    return { name: "Nirav", role: "Co-Founder & Head of Operations" };
  }
  if (authorId === "agent-k" || authorId === "k_ai" || authorId === "k-ai") {
    return { name: "@K AI", role: "Karthik's AI Strategy Advisor" };
  }
  if (authorId === "agent-n" || authorId === "n_ai" || authorId === "n-ai") {
    return { name: "@N AI", role: "Nirav's AI Operations/Risk Advisor" };
  }

  const u = users.find((user) => user.id === authorId);
  if (u) {
    const role = u.role === "ai_advisor" ? "AI Advisor" : "Founder";
    return { name: u.name, role };
  }

  return { name: authorId, role: "Participant" };
}

export function formatTimeShort(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ==========================================
// 4. Conversation History Assembly
// ==========================================

export function buildConversationTurns(
  messages: SlackMessage[],
  users: SlackUser[],
  targetPersona: AIPersonaConfig,
  limit = 20,
): ConversationTurn[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const sliced = sorted.slice(-limit);

  return sliced.map((msg) => {
    const author = formatAuthorDisplay(msg.authorId, users);
    const isTarget = msg.authorId === targetPersona.storeUserId;
    return {
      messageId: msg.id,
      authorId: msg.authorId,
      authorName: author.name,
      authorRole: author.role,
      isTargetAI: isTarget,
      content: msg.content,
      createdAt: msg.createdAt,
      formattedTime: formatTimeShort(msg.createdAt),
    };
  });
}

// ==========================================
// 5. Context Window Builder
// ==========================================

export function buildAIContext(options: ContextWindowOptions): BuiltAIContext {
  const persona = getAIPersona(options.personaId);
  const storeState = getSlackStoreState();
  const allUsers = options.users ?? storeState.users;
  const allMessages = options.messages ?? storeState.messages;
  const historyLimit = options.historyLimit ?? 20;

  const isThread = !!options.threadRootId;
  const threadRootMessage = isThread
    ? (allMessages.find((m) => m.id === options.threadRootId) ?? null)
    : null;

  // Filter messages for current scope
  const scopedMessages = isThread
    ? allMessages.filter((m) => m.threadRootId === options.threadRootId)
    : allMessages.filter((m) => m.channelId === options.channelId && !m.threadRootId);

  const conversationHistory = buildConversationTurns(
    scopedMessages,
    allUsers,
    persona,
    historyLimit,
  );

  const extractedQuery = extractMentionQuery(options.userPrompt);
  const coMentions = detectAIMentions(options.userPrompt);
  const isCoMentioned = coMentions.length > 1;

  // Assemble System Instruction
  let systemInstruction = persona.systemPrompt;

  const workspaceHeader = `\n\nWORKSPACE CONTEXT:
Workspace: Learnora Founders Workspace
Channel: #${options.channelName}${options.channelDescription ? ` (${options.channelDescription})` : ""}
Conversation Mode: ${isThread ? "Thread Reply" : "Main Channel Discussion"}
Active Participants: Karthik (Co-Founder & Head of Strategy), Nirav (Co-Founder & Head of Operations), @K AI (Strategy Advisor), @N AI (Operations/Risk Advisor)`;

  systemInstruction += workspaceHeader;

  if (isThread && threadRootMessage) {
    const rootAuthor = formatAuthorDisplay(threadRootMessage.authorId, allUsers);
    const rootTime = formatTimeShort(threadRootMessage.createdAt);
    systemInstruction += `\n\n--- THREAD ROOT MESSAGE ---
Author: ${rootAuthor.name} (${rootAuthor.role}) · ${rootTime}
Content: "${threadRootMessage.content}"
---------------------------`;
  }

  if (isCoMentioned) {
    if (options.personaId === "k_ai") {
      systemInstruction += `\n\nCO-FOUNDER CO-MENTION DIRECTIVE:
Both you (@K AI) and @N AI were tagged in this message. Focus your response on the strategic vision, market positioning, moat, and growth opportunities. Leave the operational risk, technical architecture, and cost breakdown to @N AI. Be concise and allow room for @N AI's perspective.`;
    } else {
      systemInstruction += `\n\nCO-FOUNDER CO-MENTION DIRECTIVE:
Both you (@N AI) and @K AI were tagged in this message. Focus your response on operational feasibility, system reliability, risk mitigation, and cost/runway discipline. Leave high-level market vision and growth strategy to @K AI. Be concise and allow room for @K AI's perspective.`;
    }
  }

  // Build OpenAI Messages
  const openAiMessages: OpenAiMessage[] = [
    { role: "system", content: systemInstruction },
  ];

  for (const turn of conversationHistory) {
    if (turn.isTargetAI) {
      openAiMessages.push({
        role: "assistant",
        content: turn.content,
      });
    } else {
      const header = `[${turn.authorName} (${turn.authorRole}) · ${turn.formattedTime}]`;
      openAiMessages.push({
        role: "user",
        content: `${header}\n${turn.content}`,
      });
    }
  }

  // Current query as final user turn
  const senderDisplay = formatAuthorDisplay(options.senderId, allUsers);
  openAiMessages.push({
    role: "user",
    content: `[${senderDisplay.name} (${senderDisplay.role}) · Just now]:\n${options.userPrompt}`,
  });

  // Build Gemini Payload
  const geminiContents: GeminiContent[] = [];

  // Convert history turns to alternating user/model
  for (const turn of conversationHistory) {
    const role: "user" | "model" = turn.isTargetAI ? "model" : "user";
    const text = turn.isTargetAI
      ? turn.content
      : `[${turn.authorName} (${turn.authorRole}) · ${turn.formattedTime}]:\n${turn.content}`;

    // Merge consecutive same-role turns for Gemini schema validation
    const lastTurn = geminiContents[geminiContents.length - 1];
    if (lastTurn && lastTurn.role === role) {
      lastTurn.parts[0].text += `\n\n${text}`;
    } else {
      geminiContents.push({
        role,
        parts: [{ text }],
      });
    }
  }

  // Append current user message
  const currentMsgText = `[${senderDisplay.name} (${senderDisplay.role}) · Just now]:\n${options.userPrompt}`;
  const lastGemini = geminiContents[geminiContents.length - 1];
  if (lastGemini && lastGemini.role === "user") {
    lastGemini.parts[0].text += `\n\n${currentMsgText}`;
  } else {
    geminiContents.push({
      role: "user",
      parts: [{ text: currentMsgText }],
    });
  }

  const geminiPayload: GeminiPayload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: geminiContents,
  };

  return {
    persona,
    systemInstruction,
    conversationHistory,
    extractedQuery,
    rawUserPrompt: options.userPrompt,
    isThread,
    threadRootMessage,
    openAiMessages,
    geminiPayload,
  };
}
