// Google Gemini API client (REST, no SDK needed).
// Docs: https://ai.google.dev/api/generate-content
// The key is sent in the x-goog-api-key header from the server only — never from the browser.
import { getEnv } from './config';
import { HttpError, fetchWithRetry } from './http';

export class AiDisabledError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not set, so AI features are off.');
    this.name = 'AiDisabledError';
  }
}

export function isAiConfigured(): boolean {
  return Boolean(getEnv().geminiKey);
}

/** Parse JSON that a model returned, tolerating ```json fences or stray text around it. */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Gemini did not return valid JSON');
  }
}

function friendlyError(err: unknown): Error {
  if (err instanceof HttpError) {
    if (err.status === 400) return new Error('Gemini rejected the request (HTTP 400). Check GEMINI_MODEL is a valid model name.');
    if (err.status === 401 || err.status === 403) return new Error('Gemini refused the API key (HTTP ' + err.status + '). Check GEMINI_API_KEY.');
    if (err.status === 404) return new Error('Gemini model not found (HTTP 404). Check GEMINI_MODEL.');
    if (err.status === 429) return new Error('Gemini quota or rate limit reached (HTTP 429). Try again later.');
    return new Error(`Gemini request failed: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export interface GeminiRequest {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export async function geminiJson(req: GeminiRequest, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const { geminiKey, geminiModel } = getEnv();
  if (!geminiKey) throw new AiDisabledError();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.2,
      maxOutputTokens: req.maxOutputTokens ?? 8192,
      responseMimeType: 'application/json',
    },
  };
  let json: {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify(body),
      timeoutMs: 90_000,
      retries: 2,
      baseDelayMs: 2_000,
      fetchImpl,
    });
    json = await res.json();
  } catch (err) {
    throw friendlyError(err);
  }
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) {
    const why = json.promptFeedback?.blockReason ?? json.candidates?.[0]?.finishReason ?? 'no text';
    throw new Error(`Gemini returned no answer (${why}).`);
  }
  return parseJsonLoose(text);
}

// ---------- Google Search grounding (patch 4) ----------
// Docs: https://ai.google.dev/gemini-api/docs/generate-content/google-search
// Gemini searches Google itself and returns the answer plus the web sources it used.
// Google's terms require showing the returned "search suggestions" whenever grounding is used.

export interface GroundedAnswer {
  text: string;
  sources: { title: string; url: string }[];
  queries: string[];
  suggestionsHtml?: string;
}

export function parseGroundedResponse(json: unknown): GroundedAnswer {
  const c = (json as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
      groundingMetadata?: {
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
        webSearchQueries?: string[];
        searchEntryPoint?: { renderedContent?: string };
      };
    }[];
    promptFeedback?: { blockReason?: string };
  })?.candidates?.[0];
  const text = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error(`Gemini returned no answer (${c?.finishReason ?? (json as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason ?? 'empty'}).`);
  const gm = c?.groundingMetadata;
  const seen = new Set<string>();
  const sources: { title: string; url: string }[] = [];
  for (const ch of gm?.groundingChunks ?? []) {
    const url = ch.web?.uri;
    if (typeof url !== 'string' || !/^https:\/\//.test(url) || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: (ch.web?.title ?? 'Web source').slice(0, 120), url });
  }
  return {
    text,
    sources: sources.slice(0, 10),
    queries: (gm?.webSearchQueries ?? []).filter((q): q is string => typeof q === 'string').slice(0, 6),
    suggestionsHtml: typeof gm?.searchEntryPoint?.renderedContent === 'string' ? gm.searchEntryPoint.renderedContent.slice(0, 50_000) : undefined,
  };
}

export async function geminiGrounded(req: { system: string; user: string; maxOutputTokens?: number }, fetchImpl: typeof fetch = fetch): Promise<GroundedAnswer> {
  const { geminiKey, geminiModel } = getEnv();
  if (!geminiKey) throw new AiDisabledError();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.3, maxOutputTokens: req.maxOutputTokens ?? 4096 },
  };
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify(body),
      timeoutMs: 90_000,
      retries: 1,
      baseDelayMs: 2_000,
      fetchImpl,
    });
    return parseGroundedResponse(await res.json());
  } catch (err) {
    throw friendlyError(err);
  }
}

// ---------------------------------------------------------------------------------------------
// Multi-turn chat with tools (function calling) — how modern assistants work: the model sees the
// conversation, decides which of Siva's tools to call, reads the results, then answers.
// Docs: https://ai.google.dev/gemini-api/docs/generate-content/function-calling

export interface ChatPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [k: string]: unknown;
}
export interface ChatContent {
  role: 'user' | 'model';
  parts: ChatPart[];
}
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: { type: 'object'; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required?: string[] };
}
export interface ChatTurnResult {
  /** the model's content, unchanged (keep it in the history: it carries thought signatures) */
  content: ChatContent;
  text: string;
  calls: { id?: string; name: string; args: Record<string, unknown> }[];
}

export function parseChatTurn(json: unknown): ChatTurnResult {
  const r = json as { candidates?: { content?: ChatContent; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (r.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${r.promptFeedback.blockReason})`);
  const content: ChatContent = r.candidates?.[0]?.content?.parts ? { role: 'model', parts: r.candidates[0].content.parts } : { role: 'model', parts: [] };
  const text = content.parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
  const calls = content.parts.filter((p) => p.functionCall?.name).map((p) => ({ id: p.functionCall!.id, name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
  return { content, text, calls };
}

export async function geminiChat(
  req: { system: string; contents: ChatContent[]; tools?: FunctionDeclaration[]; maxOutputTokens?: number; temperature?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<ChatTurnResult> {
  const { geminiKey, geminiModel } = getEnv();
  if (!geminiKey) throw new AiDisabledError();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    generationConfig: { temperature: req.temperature ?? 0.6, maxOutputTokens: req.maxOutputTokens ?? 4096 },
  };
  if (req.tools?.length) {
    body.tools = [{ functionDeclarations: req.tools }];
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify(body),
      timeoutMs: 60_000,
      retries: 1,
      baseDelayMs: 1_500,
      fetchImpl,
    });
    return parseChatTurn(await res.json());
  } catch (err) {
    throw friendlyError(err);
  }
}
