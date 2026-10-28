// Decide whether a spoken/typed request means "give me today's briefing"
// or is a specific follow-up question for the chat endpoint.

const BRIEFING_RE = /\b(updates?|briefing|brief me|today'?s news|news today|what'?s new|what is new|headlines|daily report|summary for today)\b/i;

export function isBriefingIntent(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 120) return false;
  if (/CVE-\d{4}-\d+/i.test(t)) return false; // a specific CVE question goes to chat
  return BRIEFING_RE.test(t);
}

/** Remove a leading wake phrase such as "Hey Siva," so it does not confuse matching. */
export function stripWakePhrase(text: string): string {
  return text.replace(/^\s*(hey|hi|ok|okay|hello)?\s*,?\s*(siva|shiva|jarvis)\b[\s,.:!?-]*/i, '').trim();
}
