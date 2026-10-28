// Small fuzzy-matching helpers so Siva still understands mispronounced or mis-typed words.
// Used for the "Hey Siva" wake word and for matching malware / actor / term names.

/** Levenshtein edit distance (number of single-character edits to turn a into b). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity (1 = identical). */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editDistance(a, b) / max;
}

export function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Does any spoken word sound close to one of the targets?
 * Allows 1 edit for short words and 2 for longer ones, so "shiva", "saiva", "civa", "sheava"
 * all match "siva". Used for the wake word.
 */
export function soundsLike(word: string, targets: string[]): boolean {
  const w = normalizeWord(word);
  if (w.length < 3) return false;
  for (const t of targets) {
    const tt = normalizeWord(t);
    // Wake names are short, and speech-to-text mangles them a lot, so be forgiving (up to 2 edits).
    const allowed = tt.length <= 6 ? 2 : 3;
    if (editDistance(w, tt) <= allowed) return true;
    // common speech-to-text splits, e.g. "see what" -> "siva"
    if (w.startsWith(tt.slice(0, 2)) && Math.abs(w.length - tt.length) <= 2 && editDistance(w, tt) <= allowed + 1) return true;
  }
  return false;
}

export interface FuzzyCandidate {
  key: string; // normalized alias to compare against
  value: string; // what to return
}

/** Best fuzzy match for a query among candidate aliases, or null when nothing is close enough. */
export function bestFuzzyMatch(query: string, candidates: FuzzyCandidate[], minSimilarity = 0.82): { value: string; score: number } | null {
  const q = normalizeWord(query);
  if (q.length < 3) return null;
  let best: { value: string; score: number } | null = null;
  for (const c of candidates) {
    if (!c.key) continue;
    // Quick reject: very different lengths cannot be close.
    if (Math.abs(c.key.length - q.length) > Math.max(2, Math.round(q.length * 0.4))) continue;
    const score = similarity(q, c.key);
    if (score >= minSimilarity && (!best || score > best.score)) best = { value: c.value, score };
  }
  return best;
}
