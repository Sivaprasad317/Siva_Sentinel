// "Who are you?" — Siva introduces himself and explains, honestly, what he can and cannot do.
// The numbers (feeds, model, search) come from the real configuration, so the answer never over-promises.
import type { AnswerCard, AssistantReply } from './types';

export interface AboutContext {
  userTitle: string;
  feedsOn: number;
  geminiOn: boolean;
  model: string;
  webSearch: boolean;
  intel: boolean;
}

export function aboutSiva(c: AboutContext): AssistantReply {
  const ai = c.geminiOn ? `I use Google Gemini (${c.model}) to explain things in simple English.` : 'Gemini is not switched on yet, so I explain things with plain templates until you add a Gemini key.';
  const speech =
    `I am Siva, ${c.userTitle}. That stands for Security Intelligence and Vigilance Assistant. ` +
    `I am your personal cybersecurity helper. I read live news and advisories from ${c.feedsOn} security sources, and I check which weaknesses are really being exploited, using the CISA known exploited list. ` +
    `I rank what matters most, explain every technical word in simple language, and tell you what to do about it. ` +
    `I can tell you about hacker groups, malware and attack techniques, answer your security questions, run safe passive checks on websites you own, and raise an alert when something critical appears. ` +
    `Just say Hey Siva and ask me anything. I only read and explain. I never change your systems.`;

  const card: AnswerCard = {
    title: 'I am Siva — your cybersecurity assistant',
    summary: `Siva Sentinel (Security Intelligence & Vigilance Assistant) is a personal, read-only assistant that watches the security world for you, explains it in simple English, and tells you what to do. ${ai}`,
    sections: [
      {
        heading: 'What I can do',
        bullets: [
          `Live news: I read ${c.feedsOn} security feeds plus Hacker News, ransomware leak-site trackers and the CISA exploited-vulnerabilities list, and keep every item in the Live feed log.`,
          'Memory: I keep everything I read (the latest 2,000 items, with dates) and search it whenever you ask, so I can tell you what I read today, this week or about any topic.',
          'Prioritise: I rank stories by what is actually being exploited and how severe it is, and show a clear Critical / High / Medium view.',
          'Explain: I define security terms in plain words (phishing, ransomware, zero-day, CVE, lateral movement…) and fix mis-heard names, like “lockbite” → LockBit.',
          `Investigate: ask about a CVE, an attack technique (T1059), a hacker group or a malware family${c.intel ? ' — I look them up in MITRE ATT&CK and MISP' : ''}${c.webSearch ? ', and I can search the web to confirm facts' : ''}.`,
          'Alert: a bell rings when a NEW critical or actively-exploited item appears, with optional desktop notifications.',
          'Check: passive security checks on websites you own, and Trivy scans of images, repos and folders you authorise.',
          'Report: download full reports, export a source pack for NotebookLM, and keep a browsable history.',
          'Talk: say “Hey Siva” hands-free; I answer by voice in a clear Indian-English man\'s voice and show the answer on screen.',
        ],
      },
      {
        heading: 'How to use me',
        bullets: ['Say “Hey Siva”, then: “What’s the update today?”, “Top threats right now”, “Explain CVE-2024-3400”, “Who is APT29?”, “What is ransomware?”.', 'Open “Live feed log” to see every item I read, with date, day, why it matters, source and link.'],
      },
      {
        heading: 'My limits (so you can trust me)',
        bullets: [
          'I only read and explain. I never change, attack or fix your systems for you.',
          'I use public sources. If a source is down or I cannot confirm something, I say so instead of guessing.',
          'I am not a replacement for your security team or for a professional penetration test.',
        ],
      },
    ],
    actions: [],
    sources: [],
    usedWebSearch: false,
    steps: [],
  };
  return { intent: 'about', speech, display: card.summary, card, citations: [], actions: [], aiStatus: c.geminiOn ? 'ok' : 'disabled' };
}
