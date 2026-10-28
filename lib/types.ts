// Shared data shapes used by the server (API routes) and the browser (dashboard).
// Keeping them in one file makes it easy to see what a "story" or "briefing" contains.

export type Category =
  | 'exploited'
  | 'vulnerability'
  | 'ransomware'
  | 'threat-actor'
  | 'breach'
  | 'cloud'
  | 'general';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

/** How much we trust that the story is accurate. */
export type Confidence = 'confirmed' | 'corroborated' | 'single-source';

export interface FeedConfig {
  name: string;
  url: string;
  /** Government or vendor source (CISA, Microsoft, Cisco, AWS...). */
  official: boolean;
}

/** One item exactly as read from an RSS/Atom feed, before cleaning. */
export interface RawItem {
  title: string;
  url: string;
  publishedAt: string | null; // ISO string, or null when missing/invalid
  snippet: string;
  source: string;
  official: boolean;
  origin?: 'feed' | 'community' | 'leak-site';
}

export interface SourceRef {
  name: string;
  url: string;
  publishedAt: string | null;
  official: boolean;
}

/** One entry from the CISA Known Exploited Vulnerabilities catalog. */
export interface KevInfo {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string; // YYYY-MM-DD
  shortDescription: string;
  requiredAction: string;
  dueDate: string; // YYYY-MM-DD
  knownRansomwareCampaignUse: string; // "Known" | "Unknown"
}

export interface Cvss {
  cve: string;
  score: number;
  severity: string;
  version: string;
}

export interface Story {
  id: string;
  title: string;
  url: string;
  source: string;
  sources: SourceRef[];
  publishedAt: string | null;
  retrievedAt: string;
  snippet: string;
  categories: Category[];
  cves: string[];
  kev: KevInfo | null;
  cvss: Cvss | null;
  score: number;
  priority: Priority;
  reasons: string[];
  verification: string[];
  confidence: Confidence;
  summary: string;
  whyItMatters: string;
  whoIsAffected: string;
  /** true when summary/whyItMatters/whoIsAffected came from Gemini. */
  aiGenerated: boolean;
  /** Threat-intel links found in the text (MITRE ATT&CK, MISP galaxy, TTP profiles). */
  intel?: StoryIntel;
  /** Main text of the article page, when Siva could read it (trimmed). */
  articleText?: string;
  articleStatus?: 'read' | 'blocked-by-robots' | 'failed' | 'skipped';
  /** Where the item came from: news feed, community (Hacker News) or a leak-site claim tracker. */
  origin?: 'feed' | 'kev' | 'community' | 'leak-site';
  /** When Siva first saw this URL (carried over between refreshes). Drives NEW badges. */
  firstSeenAt?: string;
}

/** One row of the live feed log: every item Siva has ever read (not capped at the top 60). */
export interface FeedLogEntry {
  url: string;
  title: string;
  source: string;
  publishedAt: string | null;
  firstSeenAt: string;
  /** Short "what matters" text (Gemini's explanation when available, else the feed snippet). */
  matter: string;
  priority: Priority;
  kev: boolean;
  /** false for general (non-cyber) news. Older rows may lack it; treat missing as cyber. */
  cyber?: boolean;
  cves: string[];
}

export interface IntelActor {
  name: string;
  source: 'MITRE ATT&CK' | 'MISP galaxy';
  id?: string; // e.g. G0016
  url?: string;
  country?: string;
  matchedAlias: string;
  ttpProfileUrl?: string; // crocodyli/ThreatActors-TTPs folder, when one exists
}

export interface IntelTechnique {
  id: string; // e.g. T1059.001
  name: string;
  url: string;
}

export interface StoryIntel {
  actors: IntelActor[];
  techniques: IntelTechnique[];
}

// ---------- Scans ----------

export type ScanKind = 'web' | 'trivy-image' | 'trivy-repo' | 'trivy-fs';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'pass';

export interface ScanFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  evidence: string;
  fix?: string;
  url?: string;
  inKev?: boolean;
}

export interface ScanRecord {
  id: string;
  kind: ScanKind;
  target: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  counts: Partial<Record<FindingSeverity, number>>;
  findings: ScanFinding[];
  explanation?: string; // plain-English summary (Gemini or rule-based)
}

// ---------- Assistant ----------

export type AssistantAction =
  | { type: 'navigate'; view: 'home' | 'overview' | 'history' | 'settings' | 'scans' | 'intel' | 'sources' | 'feedlog' | 'graph'; focus?: string }
  | { type: 'show-story'; storyId: string }
  | { type: 'download'; url: string }
  | { type: 'confirm-scan'; kind: ScanKind; target: string }
  | { type: 'set-voice-rate'; delta: number }
  | { type: 'refresh-started' }
  | { type: 'stop' };

export interface AnswerCard {
  title: string;
  summary: string;
  sections: { heading: string; bullets: string[] }[];
  actions: string[];
  sources: { title: string; url: string; kind?: string }[];
  /** Threat Graph node this answer is about (shows an "Open in Threat Graph" button). */
  graphFocus?: string;
  /** Google Search suggestions HTML (must be shown when Google Search grounding was used). */
  searchSuggestionsHtml?: string;
  usedWebSearch: boolean;
  steps: string[];
  note?: string;
}

export interface AssistantReply {
  card?: AnswerCard;
  speech: string;
  display?: string;
  citations: Citation[];
  actions: AssistantAction[];
  intent: string;
  aiStatus: AiStatus;
}

export interface SourceStatus {
  name: string;
  kind: 'rss' | 'kev' | 'nvd' | 'gemini' | 'intel' | 'web';
  ok: boolean;
  items: number;
  error?: string;
  /** e.g. "read via discovered feed https://…/feed/" */
  note?: string;
  fetchedAt: string;
}

export type AiStatus = 'ok' | 'disabled' | 'failed';

export interface Briefing {
  id: string;
  createdAt: string;
  trigger: 'manual' | 'scheduled' | 'live' | 'sample';
  isSample?: boolean;
  stories: Story[];
  executiveSummary: string;
  spokenScript: string;
  recommendations: string[];
  aiStatus: AiStatus;
  aiError?: string;
  sourceStatus: SourceStatus[];
}

export interface Preferences {
  briefingTime: string; // "HH:MM" 24h
  timezone: string; // IANA, e.g. Asia/Kolkata
  scheduleEnabled: boolean;
  topics: string[];
  lookbackDays: number;
  voiceRate: number;
  voiceLang: string;
  /** Exact browser voice name; empty = pick an Indian-English voice of voiceGender automatically. */
  voiceName: string;
  voicePitch: number;
  /** Siva's voice: an Indian man (default) or woman. */
  voiceGender?: 'male' | 'female';
  /** Your own voice phrases ("Hey Siva, wake up" -> "Good morning boss", "Cool" -> stop). */
  voiceCommands?: import('./voiceCommands').VoiceCommand[];
  /** Live mode: refresh automatically every N minutes (0 = off). */
  liveRefreshMinutes: number;
  /** When true, Home turns the microphone on automatically to listen for "Hey Siva". */
  wakeOnLoad: boolean;
}

export interface Citation {
  storyId: string;
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  aiStatus?: AiStatus;
  createdAt: string;
  briefingId?: string;
}

export interface RefreshState {
  running: boolean;
  startedAt: string | null;
  progress: string;
  lastError: string | null;
  lastFinishedAt: string | null;
}

// ---------- Sources & alerts (patch 7) ----------

/** A feed the user added from the Sources panel (user-managed, saved in the store). */
export interface CustomSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  addedAt: string;
}

/** One resolved source row for the Sources panel (built-in, seed or custom). */
export interface SourceRow {
  name: string;
  url: string;
  category: 'news' | 'research' | 'core';
  origin: 'builtin' | 'seed' | 'custom';
  kind: 'feed' | 'page';
  enabled: boolean;
  official: boolean;
  id?: string; // present for custom sources
}

/** A critical-item alert raised during a refresh. */
export interface AlertEntry {
  id: string;
  storyId: string;
  title: string;
  url: string;
  severity: Priority;
  source: string;
  cve?: string;
  kev: boolean;
  createdAt: string;
  seen: boolean;
}
