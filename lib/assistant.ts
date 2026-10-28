// The Jarvis-style assistant brain (server side).
// 1. routeIntent() decides what was asked (no AI needed for commands).
// 2. Data comes ONLY from collected stories, CISA KEV, NVD and the ATT&CK/MISP index.
// 3. Gemini turns that data into simple English. If Gemini is unavailable, a plain template is used.
import type { AssistantReply, Briefing, ChatMessage, Citation, Story } from './types';
import { routeIntent, type Intent } from './assistantRouter';
import { research, type StepFn } from './research';
import { converse, isSecurityTopic } from './converse';
import { stripGreeting } from './voiceCommands';
import { getEnv } from './config';
import { getRefreshState, startRefresh } from './refresh';
import { aboutSiva } from './about';
import { readStore } from './store';
import { resolveFeeds } from './feedResolve';
import { graphOutlookReply, graphQueryReply } from './graphAnswers';
import { getThreatGraph } from './graphData';

/** A briefing older than this (2 hours) is refreshed automatically when you ask for today's update. */
const FRESH_FOR_MS = 2 * 3_600_000;

const cite = (s: Story): Citation => ({ storyId: s.id, title: s.title, url: s.url });

function reply(intent: string, speech: string, extra: Partial<AssistantReply> = {}): AssistantReply {
  return { intent, speech, citations: [], actions: [], aiStatus: 'ok', ...extra };
}

const HELP =
  'You can say: "What\'s the update today?" for the briefing. "What are the top threats?" "Read story 2." "Explain CVE-2026-1234." "Do you know about LockBit?" "Who is APT29?" "What is T1059?" "Is 1.2.3.4 malicious?" "Scan my website example.com." "Scan image nginx:latest." "Open scans. Open the live feed log. What\'s the threat outlook this week? Which groups are targeting Microsoft? What\'s connected to LockBit? Who are you?" "Export to NotebookLM." Or ask any question about today\'s stories.';

export async function handleAssistant(input: string, briefing: Briefing | null, history: ChatMessage[], intentOverride?: Intent, onStep: StepFn = () => undefined): Promise<AssistantReply> {
  const intent = intentOverride ?? routeIntent(input);
  const stories = briefing?.stories ?? [];

  switch (intent.type) {
    case 'wake':
      return reply('wake', `Yes ${getEnv().userTitle}.`);
    case 'stop':
      return reply('stop', 'Okay.', { actions: [{ type: 'stop' }] });
    case 'about': {
      const env = getEnv();
      const feedsOn = resolveFeeds(await readStore()).length;
      return aboutSiva({ userTitle: env.userTitle, feedsOn, geminiOn: Boolean(env.geminiKey), model: env.geminiModel, webSearch: env.enableWebSearch, intel: env.enableIntel });
    }
    case 'outlook':
      return graphOutlookReply(await getThreatGraph(30), getEnv().userTitle);
    case 'graph': {
      const g = await getThreatGraph(intent.mode === 'targets' ? 30 : 90);
      return graphQueryReply(g, intent, getEnv().userTitle);
    }
    case 'help':
      return reply('help', HELP);
    case 'voice-rate':
      return reply('voice-rate', intent.delta > 0 ? 'Speaking a little faster.' : 'Speaking a little slower.', { actions: [{ type: 'set-voice-rate', delta: intent.delta }] });
    case 'navigate':
      return reply('navigate', `Opening ${({ overview: 'the intelligence dashboard', feedlog: 'the live feed log', sources: 'the live sources', graph: 'the threat graph' } as Record<string, string>)[intent.view] ?? intent.view}.`, { actions: [{ type: 'navigate', view: intent.view }] });
    case 'export':
      if (!briefing) return reply('export', 'There is no briefing to export yet. Run a refresh first.');
      return reply('export', 'Downloading the NotebookLM source pack. Upload that file to NotebookLM, or paste its URL list as website sources.', {
        actions: [{ type: 'download', url: `/api/export/notebooklm?id=${encodeURIComponent(briefing.id)}` }],
      });
    case 'scan':
      return reply('scan', `I can run a ${intent.kind === 'web' ? 'passive website security check' : 'Trivy scan'} on ${intent.target}. Please confirm on screen. Only scan things you own or are allowed to test.`, {
        actions: [{ type: 'confirm-scan', kind: intent.kind, target: intent.target }],
      });
    case 'briefing': {
      const fresh = briefing && !briefing.isSample && Date.now() - Date.parse(briefing.createdAt) < FRESH_FOR_MS;
      if (!fresh) {
        const started = getRefreshState().running || startRefresh('manual');
        if (started) {
          return reply(
            'briefing-refresh',
            `${briefing ? 'My last briefing is a few hours old, so I am' : 'I am'} collecting the latest news, advisories, Hacker News threads and leak-site claims right now. It usually takes one to three minutes. I will read you the briefing as soon as it is ready.`,
            { actions: [{ type: 'refresh-started' }] },
          );
        }
      }
      if (!briefing) return reply('briefing', 'I do not have a briefing yet. Press Refresh now, and ask me again in a couple of minutes.');
      return reply('briefing', stripGreeting(briefing.spokenScript), { citations: stories.slice(0, 5).map(cite), aiStatus: briefing.aiStatus, display: briefing.executiveSummary });
    }
    case 'top': {
      const top = stories.filter((s) => s.priority === 'critical' || s.priority === 'high').slice(0, 5);
      if (!top.length) return reply('top', briefing ? 'Nothing is ranked critical or high right now.' : 'Run a refresh first.');
      const speech = `Here are the most urgent items. ${top.map((s, i) => `Number ${i + 1}: ${s.title}. ${s.kev ? 'This is confirmed exploited by CISA.' : ''}`).join(' ')} Say "read story" and a number for details.`;
      return reply('top', speech, { citations: top.map(cite) });
    }
    case 'story': {
      const s = stories[intent.index - 1];
      if (!s) return reply('story', `I only have ${stories.length} stories in this briefing.`);
      const speech = `Story ${intent.index}: ${s.title}. ${s.summary} ${s.whyItMatters ? `Why it matters: ${s.whyItMatters}` : ''}`;
      return reply('story', speech, { citations: [cite(s)], actions: [{ type: 'show-story', storyId: s.id }], aiStatus: s.aiGenerated ? 'ok' : 'disabled' });
    }
    case 'cve':
    case 'technique':
    case 'actor':
      return research(input, intent, briefing, history, onStep);
    case 'chat':
    default: {
      // Like Gemini / ChatGPT: a real conversation (with memory and tools) for everyday questions
      // and follow-ups; the deep research card for security topics.
      const text = intent.type === 'chat' ? intent.text : input;
      // The conversation = the last 20 minutes of chat (older turns are a different conversation).
      const recent = history.filter((m) => Date.now() - (Date.parse(m.createdAt) || 0) < 20 * 60_000);
      const words = text.trim().split(/\s+/).length;
      const followUp = recent.length > 0 && words <= 10 && (/^(and|but|so|also|what about|how about|tell me more|more on|explain (that|it|more)|what does that mean)\b/i.test(text.trim()) || /\b(it|that|this|them|they|those|he|she|him|her)\b/i.test(text));
      if (isSecurityTopic(text) && !followUp) return research(input, intent, briefing, history, onStep);
      return converse(text, recent, briefing, onStep);
    }
  }
}
