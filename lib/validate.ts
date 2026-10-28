// Input validation for everything the browser sends to the server.
import { validateVoiceCommands } from './voiceCommands';
import type { Preferences } from './types';
import { isValidHHMM, isValidTimezone } from './schedule';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateChatInput(body: unknown): Result<{ message: string }> {
  const message = (body as { message?: unknown })?.message;
  if (typeof message !== 'string') return { ok: false, error: 'message must be text' };
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: 'message is empty' };
  if (trimmed.length > 1000) return { ok: false, error: 'message is too long (max 1000 characters)' };
  return { ok: true, value: { message: trimmed } };
}

export function validatePreferences(body: unknown, current: Preferences): Result<Preferences> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' };
  const b = body as Record<string, unknown>;
  const next: Preferences = { ...current };

  if (b.briefingTime !== undefined) {
    if (typeof b.briefingTime !== 'string' || !isValidHHMM(b.briefingTime)) return { ok: false, error: 'briefingTime must be HH:MM (24-hour)' };
    next.briefingTime = b.briefingTime;
  }
  if (b.timezone !== undefined) {
    if (typeof b.timezone !== 'string' || !isValidTimezone(b.timezone)) return { ok: false, error: 'timezone must be a valid IANA name such as Asia/Kolkata' };
    next.timezone = b.timezone;
  }
  if (b.scheduleEnabled !== undefined) {
    if (typeof b.scheduleEnabled !== 'boolean') return { ok: false, error: 'scheduleEnabled must be true or false' };
    next.scheduleEnabled = b.scheduleEnabled;
  }
  if (b.topics !== undefined) {
    if (!Array.isArray(b.topics) || b.topics.some((t) => typeof t !== 'string')) return { ok: false, error: 'topics must be a list of words' };
    const topics = [...new Set((b.topics as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (topics.length > 20 || topics.some((t) => t.length > 40)) return { ok: false, error: 'Up to 20 topics, 40 characters each' };
    next.topics = topics;
  }
  if (b.lookbackDays !== undefined) {
    const n = Number(b.lookbackDays);
    if (!Number.isInteger(n) || n < 1 || n > 14) return { ok: false, error: 'lookbackDays must be 1 to 14' };
    next.lookbackDays = n;
  }
  if (b.voiceRate !== undefined) {
    const n = Number(b.voiceRate);
    if (!Number.isFinite(n) || n < 0.5 || n > 2) return { ok: false, error: 'voiceRate must be between 0.5 and 2' };
    next.voiceRate = n;
  }
  if (b.voiceLang !== undefined) {
    if (typeof b.voiceLang !== 'string' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(b.voiceLang)) return { ok: false, error: 'voiceLang must look like en-IN' };
    next.voiceLang = b.voiceLang;
  }
  if (b.voiceName !== undefined) {
    if (typeof b.voiceName !== 'string' || b.voiceName.length > 120) return { ok: false, error: 'voiceName must be text (max 120 characters)' };
    next.voiceName = b.voiceName.trim();
  }
  if (b.voicePitch !== undefined) {
    const n = Number(b.voicePitch);
    if (!Number.isFinite(n) || n < 0.5 || n > 2) return { ok: false, error: 'voicePitch must be between 0.5 and 2' };
    next.voicePitch = n;
  }
  if (b.liveRefreshMinutes !== undefined) {
    const n = Number(b.liveRefreshMinutes);
    if (!Number.isInteger(n) || (n !== 0 && (n < 5 || n > 1440))) return { ok: false, error: 'Live refresh must be 0 (off) or 5 to 1440 minutes' };
    next.liveRefreshMinutes = n;
  }
  if (b.voiceCommands !== undefined) {
    const cmds = validateVoiceCommands(b.voiceCommands);
    if (!cmds) return { ok: false, error: 'voiceCommands: each needs a phrase (max 80 chars), an action (say/stop) and, for "say", a reply (max 300 chars). Max 30.' };
    next.voiceCommands = cmds;
  }
  if (b.voiceGender !== undefined) {
    if (b.voiceGender !== 'male' && b.voiceGender !== 'female') return { ok: false, error: 'voiceGender must be male or female' };
    next.voiceGender = b.voiceGender;
  }
  if (b.wakeOnLoad !== undefined) {
    if (typeof b.wakeOnLoad !== 'boolean') return { ok: false, error: 'wakeOnLoad must be true or false' };
    next.wakeOnLoad = b.wakeOnLoad;
  }
  return { ok: true, value: next };
}
