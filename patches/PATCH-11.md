# SIVA Sentinel patch 11 (cumulative: includes patches 02-10)

ART prompt for this patch
- ACT AS: a senior full-stack engineer and cybersecurity-intelligence architect maintaining SIVA Sentinel.
- REQUEST: (1) fix the React "two children with the same key `SecurityWeek`" error at its root;
  (2) make Siva keep herself updated every 1-3 hours by herself — read all her sources, remember what she
  read with dates, and answer any question from that memory, even when the browser is closed.
- TERMS: free and local only; read-only and defensive; respect feeds/robots; never invent facts — cite
  sources with dates; say how fresh the reading is; no new npm packages; tests for every change; must
  apply over any earlier patch; Windows-friendly PowerShell.

What changed
- Unique source names (built-in wins) + index-safe React keys -> duplicate-key error gone.
- Feed auto-discovery for web-page sources (82 of 154 were pages reading nothing).
- 4 Google News RSS search feeds (on by default), publisher credited per story.
- Reading memory: research searches the whole feed log (2,000 items) with time windows; "From my reading".
- Freshness: re-reads in the background if older than 2 h; briefing auto-refresh at 2 h; 3-hour option.
- install-autostart.ps1 / start-siva-background.ps1: run hidden at Windows login, always reading.
