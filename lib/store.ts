// Local storage: one JSON file (data/siva-store.json) on YOUR computer.
// Good enough for a personal app; swap for Supabase/Postgres later without touching the UI.
// Writes go to a temp file first, then are renamed, so a crash cannot half-write the file.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FeedLogEntry, AlertEntry, Briefing, ChatMessage, CustomSource, Cvss, Preferences, ScanRecord } from './types';
import { DEFAULT_PREFERENCES, getEnv } from './config';

export interface StoreShape {
  version: 1;
  briefings: Briefing[]; // newest first
  preferences: Preferences;
  chat: ChatMessage[]; // oldest first
  nvdCache: Record<string, { cvss: Cvss | null; fetchedAt: string }>;
  scans: ScanRecord[]; // newest first
  sources: CustomSource[]; // user-added feeds
  feedPrefs: Record<string, boolean>; // url -> enabled override for built-in/seed feeds
  alerts: AlertEntry[]; // newest first
  alertedUrls: string[]; // urls already alerted on (dedupe), newest first
  feedLog: FeedLogEntry[]; // newest first, every item ever read (capped)
  meta: { lastScheduledDateKey?: string; lastRunAt?: string; lastError?: string | null; checks?: number; lastNewItems?: number; lastPoolSize?: number };
}

const MAX_BRIEFINGS = 30;
const MAX_CHAT = 300;

function emptyStore(): StoreShape {
  return { version: 1, briefings: [], preferences: { ...DEFAULT_PREFERENCES }, chat: [], nvdCache: {}, scans: [], sources: [], feedPrefs: {}, alerts: [], alertedUrls: [], feedLog: [], meta: {} };
}

function storePath() {
  return path.join(getEnv().dataDir, 'siva-store.json');
}

export async function readStore(): Promise<StoreShape> {
  const file = storePath();
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw err;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    const base = emptyStore();
    return {
      ...base,
      ...parsed,
      preferences: { ...base.preferences, ...(parsed.preferences ?? {}) },
      meta: { ...(parsed.meta ?? {}) },
      nvdCache: parsed.nvdCache ?? {},
      briefings: Array.isArray(parsed.briefings) ? parsed.briefings : [],
      chat: Array.isArray(parsed.chat) ? parsed.chat : [],
      scans: Array.isArray(parsed.scans) ? parsed.scans : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      feedPrefs: parsed.feedPrefs && typeof parsed.feedPrefs === 'object' ? parsed.feedPrefs : {},
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      alertedUrls: Array.isArray(parsed.alertedUrls) ? parsed.alertedUrls : [],
      feedLog: Array.isArray(parsed.feedLog) ? parsed.feedLog : [],
      version: 1,
    };
  } catch {
    // Corrupt file: keep a copy for inspection (never delete it) and start fresh.
    await fs.copyFile(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
    return emptyStore();
  }
}

async function writeStore(data: StoreShape): Promise<void> {
  const file = storePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  data.briefings = data.briefings.slice(0, MAX_BRIEFINGS);
  data.chat = data.chat.slice(-MAX_CHAT);
  data.scans = data.scans.slice(0, 20);
  data.alerts = data.alerts.slice(0, 100);
  data.alertedUrls = data.alertedUrls.slice(0, 3000);
  data.feedLog = data.feedLog.slice(0, 2000);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1), 'utf8');
  // On Windows (especially inside OneDrive) the file can be briefly locked; retry, then fall back to copy.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 4) {
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        continue;
      }
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
        await fs.copyFile(tmp, file);
        await fs.unlink(tmp).catch(() => undefined);
        return;
      }
      throw err;
    }
  }
}

// Serialize updates so two requests never overwrite each other's changes.
const g = globalThis as unknown as { __sivaStoreQueue?: Promise<unknown> };

export function updateStore<T>(fn: (data: StoreShape) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const data = await readStore();
    const result = await fn(data);
    await writeStore(data);
    return result;
  };
  const next = (g.__sivaStoreQueue ?? Promise.resolve()).then(run, run);
  g.__sivaStoreQueue = next.catch(() => undefined);
  return next;
}
