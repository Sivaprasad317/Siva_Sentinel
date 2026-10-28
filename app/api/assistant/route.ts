// POST /api/assistant {message, briefingId?} -> Jarvis-style reply: speech text, citations and UI actions.
import { randomUUID } from 'node:crypto';
import { readStore, updateStore } from '../../../lib/store';
import { handleAssistant } from '../../../lib/assistant';
import { validateChatInput } from '../../../lib/validate';
import { errorJson, json, limited, readJsonBody } from '../../../lib/api';
import type { ChatMessage } from '../../../lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const blocked = limited(req, 'assistant', 30, 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const input = validateChatInput(body.value);
  if (!input.ok) return errorJson(input.error, 400);

  const briefingId = (body.value as { briefingId?: unknown }).briefingId;
  const store = await readStore();
  const briefing = (typeof briefingId === 'string' && store.briefings.find((b) => b.id === briefingId)) || store.briefings[0] || null;

  const result = await handleAssistant(input.value.message, briefing, store.chat);
  const now = new Date().toISOString();
  const userMsg: ChatMessage = { id: randomUUID(), role: 'user', text: input.value.message, createdAt: now, briefingId: briefing?.id };
  const botMsg: ChatMessage = {
    id: randomUUID(),
    role: 'assistant',
    text: result.display && result.intent !== 'briefing' ? result.display : result.speech,
    citations: result.citations,
    aiStatus: result.aiStatus,
    createdAt: new Date().toISOString(),
    briefingId: briefing?.id,
  };
  await updateStore((d) => {
    d.chat.push(userMsg, botMsg);
  });
  return json({ reply: result, message: botMsg });
}
