// POST /api/ask {message, briefingId?}
// Same brain as /api/assistant, but streams progress so the screen can show the REAL research
// steps while Siva says "I am checking". Response: newline-delimited JSON (one object per line):
//   {"type":"step","text":"Searching MITRE ATT&CK…"}
//   {"type":"result","reply":{…},"message":{…}}
//   {"type":"error","error":"…"}
import { randomUUID } from 'node:crypto';
import { readStore, updateStore } from '../../../lib/store';
import { handleAssistant } from '../../../lib/assistant';
import { validateChatInput } from '../../../lib/validate';
import { errorJson, limited, readJsonBody } from '../../../lib/api';
import type { ChatMessage } from '../../../lib/types';
import { cardToText } from '../../../lib/answerCard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const blocked = limited(req, 'ask', 30, 60_000);
  if (blocked) return blocked;
  const body = await readJsonBody(req);
  if (!body.ok) return body.res;
  const input = validateChatInput(body.value);
  if (!input.ok) return errorJson(input.error, 400);
  const briefingId = (body.value as { briefingId?: unknown }).briefingId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const store = await readStore();
        const briefing = (typeof briefingId === 'string' && store.briefings.find((b) => b.id === briefingId)) || store.briefings[0] || null;
        const reply = await handleAssistant(input.value.message, briefing, store.chat, undefined, (text) => send({ type: 'step', text }));
        const now = new Date().toISOString();
        const userMsg: ChatMessage = { id: randomUUID(), role: 'user', text: input.value.message, createdAt: now, briefingId: briefing?.id };
        const botMsg: ChatMessage = {
          id: randomUUID(),
          role: 'assistant',
          text: reply.card ? cardToText(reply.card) : reply.display && reply.intent !== 'briefing' ? reply.display : reply.speech,
          citations: reply.citations,
          aiStatus: reply.aiStatus,
          createdAt: new Date().toISOString(),
          briefingId: briefing?.id,
        };
        if (reply.intent !== 'wake') {
          await updateStore((d) => {
            d.chat.push(userMsg, botMsg);
          });
        }
        send({ type: 'result', reply, message: botMsg });
      } catch (err) {
        send({ type: 'error', error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
