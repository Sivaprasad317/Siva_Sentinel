// GET  /api/chat -> recent conversation
// POST /api/chat {message, briefingId?} -> grounded answer with citations to collected stories
// DELETE /api/chat -> clear the saved conversation
import { randomUUID } from 'node:crypto';
import { readStore, updateStore } from '../../../lib/store';
import { answerQuestion } from '../../../lib/ai';
import { validateChatInput } from '../../../lib/validate';
import { errorJson, json, limited, readJsonBody } from '../../../lib/api';
import type { ChatMessage } from '../../../lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const store = await readStore();
  return json({ messages: store.chat.slice(-50) });
}

export async function POST(req: Request) {
  const blocked = limited(req, 'chat', 20, 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const input = validateChatInput(body.value);
  if (!input.ok) return errorJson(input.error, 400);

  const briefingId = (body.value as { briefingId?: unknown }).briefingId;
  const store = await readStore();
  const briefing =
    (typeof briefingId === 'string' && store.briefings.find((b) => b.id === briefingId)) || store.briefings[0] || null;

  const result = await answerQuestion(input.value.message, briefing, store.chat);
  const now = new Date().toISOString();
  const userMsg: ChatMessage = { id: randomUUID(), role: 'user', text: input.value.message, createdAt: now, briefingId: briefing?.id };
  const botMsg: ChatMessage = {
    id: randomUUID(),
    role: 'assistant',
    text: result.answer,
    citations: result.citations,
    aiStatus: result.aiStatus,
    createdAt: new Date().toISOString(),
    briefingId: briefing?.id,
  };
  await updateStore((d) => {
    d.chat.push(userMsg, botMsg);
  });
  return json({ message: botMsg });
}

export async function DELETE(req: Request) {
  const blocked = limited(req, 'chat-delete', 10, 60_000);
  if (blocked) return blocked;
  const removed = await updateStore((d) => {
    const n = d.chat.length;
    d.chat = [];
    return n;
  });
  return json({ removed });
}
