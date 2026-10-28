// Siva as a real conversational AI (like Gemini / ChatGPT voice mode):
//  - remembers the conversation (multi-turn), so "and how do I stop it?" just works
//  - answers anything helpful in natural spoken English, short by default
//  - uses TOOLS (function calling) to read YOUR data: today's briefing, everything he has read,
//    CVE checks (CISA KEV + EPSS + NVD), this week's threat outlook, the time, opening screens
//  - uses Google Search grounding for general / current-events questions
// Deep security topics still go to the research pipeline (sectioned answer cards).
import type { AssistantAction, AssistantReply, Briefing, ChatMessage, FeedLogEntry } from './types';
import { AiDisabledError, geminiChat, geminiGrounded, type ChatContent, type FunctionDeclaration } from './gemini';
import { getEnv } from './config';
import { readStore } from './store';
import { searchMemory, freshness } from './memory';
import { fetchNvdDetails, getKevMap } from './sources';
import { epssLookup, epssPlain } from './knowledge';
import { getThreatGraph } from './graphData';
import { graphOutlookReply } from './graphAnswers';
import { stripGreeting } from './voiceCommands';
import type { StepFn } from './research';

export { isSecurityTopic, chooseChatMode } from './chatRoute';
import { chooseChatMode } from './chatRoute';

// ------------------------------------------------------------------ persona (ART framework)
export function chatSystemPrompt(userTitle: string, nowText: string): string {
  return `ACT AS: Siva — the voice of SIVA Sentinel, a friendly, confident young Indian man (about 27) who is a personal AI assistant and a senior cybersecurity expert for one person, whom you call "${userTitle}".

REQUEST: Have a natural, spoken conversation, the way a top voice assistant does. Understand what ${userTitle} means (speech-to-text can mis-hear words; pick the most likely meaning), use the earlier turns of the conversation to resolve "it", "that", "him" and follow-ups, and give a genuinely helpful answer. Use your tools whenever the question is about ${userTitle}'s own security data (today's briefing, the news you have read, CVEs, this week's threat outlook, opening a screen) — never guess those.

TERMS:
- Answer first, directly. Short by default: 1-3 sentences for simple questions, up to about 120 words when explaining. Go longer only if asked for detail.
- This is SPOKEN: plain sentences only — no markdown, no bullet lists, no emojis, no URLs, no headings.
- Do NOT greet (no "good morning", "good evening", "hello", "namaste") and do not open with filler like "Sure!" or "Great question". ${userTitle} has personal greeting phrases that are handled separately.
- Natural Indian English with a light touch ("boss", "see", "no tension") at most once per answer.
- Be honest: if you are not sure or a tool returns nothing, say so in one line. Never invent facts, numbers, dates, CVEs or quotes. Never claim you did something you did not do.
- Time-sensitive facts come from tools or search results; mention the date when it matters. Current date/time: ${nowText}.
- Security: defensive and educational only — never give attack instructions, exploit code or ways to evade security.
- You are read-only: you can explain, look up and open screens; you cannot change systems.`;
}

// ------------------------------------------------------------------ tools
export const SIVA_TOOLS: FunctionDeclaration[] = [
  {
    name: 'search_my_news',
    description: "Search everything Siva has read from the user's security news feeds (titles, dates, sources, why it matters). Use for questions about recent security news, a vendor, a product, a group or a topic in the news.",
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'what to look for, e.g. "Fortinet", "ransomware hospitals", "Patch Tuesday"' }, days: { type: 'number', description: 'only items from the last N days (default 7)' } }, required: ['query'] },
  },
  { name: 'get_todays_briefing', description: "Get today's security briefing: summary and the most important stories ranked by urgency.", parameters: { type: 'object', properties: {} } },
  {
    name: 'check_cve',
    description: 'Look up one CVE: is it actively exploited (CISA KEV), how likely exploitation is (EPSS), severity and description (NVD).',
    parameters: { type: 'object', properties: { cve_id: { type: 'string', description: 'e.g. CVE-2024-3400' } }, required: ['cve_id'] },
  },
  { name: 'get_threat_outlook', description: "This week's threat outlook: which hacker groups, malware, CVEs and vendors are rising in the news compared with last week.", parameters: { type: 'object', properties: {} } },
  {
    name: 'open_screen',
    description: 'Open a screen in the Siva app for the user.',
    parameters: { type: 'object', properties: { screen: { type: 'string', enum: ['home', 'dashboard', 'threat_graph', 'feed_log', 'sources', 'scans', 'history', 'settings', 'intel'] } }, required: ['screen'] },
  },
];

export interface ToolDeps {
  feedLog: () => Promise<{ log: FeedLogEntry[]; lastRunAt: string | null }>;
  briefing: () => Briefing | null;
  kev: typeof getKevMap;
  nvd: typeof fetchNvdDetails;
  epss: typeof epssLookup;
  outlook: () => Promise<string>;
}

const SCREEN_VIEW: Record<string, Extract<AssistantAction, { type: 'navigate' }>['view']> = {
  home: 'home', dashboard: 'overview', threat_graph: 'graph', feed_log: 'feedlog', sources: 'sources', scans: 'scans', history: 'history', settings: 'settings', intel: 'intel',
};

export async function runTool(name: string, args: Record<string, unknown>, deps: ToolDeps, actions: AssistantAction[]): Promise<Record<string, unknown>> {
  switch (name) {
    case 'search_my_news': {
      const q = String(args.query ?? '').slice(0, 200);
      const days = Math.min(90, Math.max(1, Number(args.days) || 7));
      const { log, lastRunAt } = await deps.feedLog();
      const now = new Date();
      const recent = log.filter((e) => now.getTime() - (Date.parse(e.publishedAt || e.firstSeenAt) || 0) <= days * 86_400_000);
      const r = searchMemory(recent, q, now, 8);
      return {
        readingFreshness: freshness(lastRunAt, now).label,
        results: r.hits.map((h) => ({ date: (h.entry.publishedAt || h.entry.firstSeenAt).slice(0, 10), title: h.entry.title, source: h.entry.source, whyItMatters: h.entry.matter.slice(0, 300), exploited: h.entry.kev || undefined, cves: h.entry.cves.length ? h.entry.cves : undefined })),
      };
    }
    case 'get_todays_briefing': {
      const b = deps.briefing();
      if (!b) return { error: 'No briefing yet. The user can press Refresh on the dashboard.' };
      return {
        createdAt: b.createdAt,
        summary: b.executiveSummary,
        top: b.stories.slice(0, 6).map((s) => ({ title: s.title, priority: s.priority, exploited: Boolean(s.kev), source: s.source, why: (s.whyItMatters || s.summary).slice(0, 220) })),
        recommendations: b.recommendations.slice(0, 4),
      };
    }
    case 'check_cve': {
      const id = String(args.cve_id ?? '').toUpperCase().trim();
      if (!/^CVE-\d{4}-\d{4,7}$/.test(id)) return { error: `"${id}" is not a valid CVE ID.` };
      const [kevR, nvdR, epssR] = await Promise.allSettled([deps.kev(), deps.nvd(id), deps.epss(id)]);
      const kev = kevR.status === 'fulfilled' ? kevR.value.get(id) : undefined;
      const nvd = nvdR.status === 'fulfilled' ? nvdR.value : null;
      const ep = epssR.status === 'fulfilled' ? epssR.value : null;
      return {
        cve: id,
        exploitedPerCisaKev: kev ? { yes: true, vendor: kev.vendorProject, product: kev.product, added: kev.dateAdded, dueDate: kev.dueDate, ransomware: kev.knownRansomwareCampaignUse } : { yes: false },
        epss: ep ? epssPlain(ep) : 'not available',
        nvd: nvd ? { description: nvd.description?.slice(0, 500), cvss: nvd.cvss?.score ?? null, severity: nvd.cvss?.severity ?? null, published: nvd.published } : 'not available',
      };
    }
    case 'get_threat_outlook':
      return { outlook: await deps.outlook() };
    case 'open_screen': {
      const view = SCREEN_VIEW[String(args.screen)];
      if (!view) return { error: 'Unknown screen' };
      actions.push({ type: 'navigate', view });
      return { opened: String(args.screen) };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// ------------------------------------------------------------------ conversation history
export function historyToContents(history: ChatMessage[], maxTurns = 10): ChatContent[] {
  const out: ChatContent[] = [];
  for (const m of history.slice(-maxTurns)) {
    const text = (m.text ?? '').trim().slice(0, 700);
    if (!text) continue;
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** Make model text safe and pleasant to speak. */
export function toSpeech(text: string): string {
  return stripGreeting(
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`>|]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

// ------------------------------------------------------------------ the conversation
export interface ConverseDeps {
  chat: typeof geminiChat;
  grounded: typeof geminiGrounded;
  tools: ToolDeps;
}

const defaultToolDeps = (briefing: Briefing | null): ToolDeps => ({
  feedLog: async () => {
    const st = await readStore();
    return { log: st.feedLog, lastRunAt: st.meta.lastRunAt ?? null };
  },
  briefing: () => briefing,
  kev: getKevMap,
  nvd: fetchNvdDetails,
  epss: epssLookup,
  outlook: async () => graphOutlookReply(await getThreatGraph(30), getEnv().userTitle).speech,
});

export async function converse(
  question: string,
  history: ChatMessage[],
  briefing: Briefing | null,
  onStep: StepFn = () => undefined,
  depsIn?: Partial<ConverseDeps>,
): Promise<AssistantReply> {
  const env = getEnv();
  const deps: ConverseDeps = { chat: geminiChat, grounded: geminiGrounded, tools: defaultToolDeps(briefing), ...depsIn };
  let tz = 'Asia/Kolkata';
  try {
    tz = (await readStore()).preferences.timezone || tz;
  } catch {
    /* tests / first run */
  }
  const nowText = new Date().toLocaleString('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const system = chatSystemPrompt(env.userTitle, nowText);
  const actions: AssistantAction[] = [];
  const sources: { title: string; url: string; kind?: string }[] = [];
  const mode = chooseChatMode(question, env.enableWebSearch);
  let text = '';
  let usedWeb = false;

  try {
    if (mode === 'chat-web') {
      onStep('Searching the web (Google Search)');
      const convo = historyToContents(history, 6).map((c) => `${c.role === 'model' ? 'Siva' : env.userTitle}: ${c.parts.map((p) => p.text).join(' ')}`).join('\n');
      const g = await deps.grounded({ system, user: `${convo ? `Conversation so far:\n${convo}\n\n` : ''}${env.userTitle} now says: "${question.slice(0, 800)}"\nAnswer as Siva, following the TERMS.`, maxOutputTokens: 4096 });
      text = g.text;
      usedWeb = true;
      for (const s of g.sources.slice(0, 6)) sources.push({ title: s.title, url: s.url, kind: 'web' });
    } else {
      const contents: ChatContent[] = [...historyToContents(history), { role: 'user', parts: [{ text: question.slice(0, 1500) }] }];
      for (let round = 0; round < 4; round++) {
        const turn = await deps.chat({ system, contents, tools: SIVA_TOOLS, temperature: 0.6 });
        if (!turn.calls.length) {
          text = turn.text;
          break;
        }
        contents.push(turn.content); // unchanged: keeps thought signatures
        const responses = [];
        for (const c of turn.calls.slice(0, 4)) {
          onStep(TOOL_STEP[c.name] ?? `Using ${c.name}`);
          let result: Record<string, unknown>;
          try {
            result = await runTool(c.name, c.args, deps.tools, actions);
          } catch (err) {
            result = { error: (err as Error).message };
          }
          responses.push({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responses });
      }
    }
  } catch (err) {
    if (err instanceof AiDisabledError) {
      return reply('Boss, I need my Gemini key to chat about that. For security questions I can still answer from my own sources — try asking about a threat or a CVE.', 'disabled', question, sources, actions, false);
    }
    return reply(`Sorry ${env.userTitle}, I could not get an answer right now (${(err as Error).message}).`, 'failed', question, sources, actions, false);
  }
  if (!text) text = `Sorry ${env.userTitle}, I don't have a good answer for that.`;
  return reply(text, 'ok', question, sources, actions, usedWeb);
}

const TOOL_STEP: Record<string, string> = {
  search_my_news: 'Searching the news I have read',
  get_todays_briefing: "Reading today's briefing",
  check_cve: 'Checking the CVE (CISA KEV, EPSS, NVD)',
  get_threat_outlook: "Checking this week's threat outlook",
  open_screen: 'Opening the screen',
};

function reply(text: string, aiStatus: AssistantReply['aiStatus'], question: string, sources: { title: string; url: string; kind?: string }[], actions: AssistantAction[], usedWeb: boolean): AssistantReply {
  const speech = toSpeech(text);
  const title = question.replace(/^\s*(hey|hi|ok|okay)\s+(siva|shiva)[,\s]*/i, '').trim();
  return {
    intent: 'chat',
    speech,
    display: speech,
    citations: sources.map((s) => ({ storyId: '', title: s.title, url: s.url })),
    actions,
    aiStatus,
    card: { title: title ? title[0].toUpperCase() + title.slice(1, 90) : 'Siva', summary: speech, sections: [], actions: [], sources, usedWebSearch: usedWeb, steps: [] },
  };
}
