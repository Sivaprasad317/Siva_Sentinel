// Turn any assistant reply into an answer card for the Home screen (pure, testable).
import type { AnswerCard, AssistantReply, Briefing } from './types';

/** Turn any assistant reply into an answer card for display. */
export function toCard(r: AssistantReply, briefing: Briefing | null): AnswerCard {
  if (r.card) return r.card;
  const base: AnswerCard = { title: '', summary: r.display ?? r.speech, sections: [], actions: [], sources: r.citations.map((c) => ({ title: c.title, url: c.url, kind: c.storyId ? 'story' : 'link' })), usedWebSearch: false, steps: [] };
  if (r.intent === 'briefing' && briefing) {
    return {
      ...base,
      title: "Today's update",
      summary: briefing.executiveSummary,
      sections: [{ heading: 'Top stories', bullets: briefing.stories.slice(0, 6).map((s) => `${s.priority.toUpperCase()} · ${s.title}${s.kev ? ' (exploited, CISA KEV)' : ''}`) }],
      actions: briefing.recommendations,
    };
  }
  const titles: Record<string, string> = { top: 'Most urgent right now', story: 'Story details', 'briefing-refresh': 'Collecting the latest intelligence', help: 'What I can do', navigate: 'Opening', export: 'Export', scan: 'Scan request' };
  return { ...base, title: titles[r.intent] ?? 'Siva' };
}


/** Plain-text version of an answer card (chat drawer, saved chat history): title, summary and key points. */
export function cardToText(c: Pick<AnswerCard, 'title' | 'summary' | 'sections' | 'actions'>, maxSections = 4): string {
  const parts = [c.title, c.summary].filter(Boolean);
  const wanted = ['Key points', 'How it works', 'Why it matters', 'How to spot it'];
  const secs = c.sections.filter((s) => wanted.includes(s.heading)).slice(0, maxSections);
  const chosen = secs.length ? secs : c.sections.slice(0, 2);
  for (const s of chosen) parts.push(`${s.heading}:\n${s.bullets.map((b) => `• ${b}`).join('\n')}`);
  if (c.actions.length) parts.push(`What to do:\n${c.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);
  return parts.join('\n\n');
}
