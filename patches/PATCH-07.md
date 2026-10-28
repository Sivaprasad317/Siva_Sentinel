# SIVA Sentinel patch 07 (cumulative: includes patches 02-06)

Live sources you control, plus critical alerts.

## Live sources
- Your full threat-intel feed list (~135 feeds) is now built in. A curated ~30 are ON by default so
  refreshes stay fast; the rest are one click away.
- New **Live sources** screen (📡 in the sidebar): switch any feed on/off, add your own feed, remove
  ones you added, filter, and see each feed's last-fetch result. "Enable all" / "Disable seed feeds"
  flip the whole seed list at once.
- Choices are saved in `data/siva-store.json`, so they survive restarts and you can change them any
  time. Core feeds can't be removed, only disabled.
- Feeds are fetched with limited concurrency (8 at a time) on every refresh of your live-mode
  schedule. (A polite interval, not "every minute" — kinder to publishers and avoids rate-limit bans.)

## Critical alerts
- New 🔔 bell in the top bar. Siva raises an alert only for a NEW item that is exploited in the wild
  (CISA KEV) or rated critical — not routine news. Badge for unseen, dropdown with severity/CVE/age,
  click to open the story.
- Optional desktop notifications: tick "Notify" and allow the browser prompt. The first load does not
  flood you with the existing backlog.

## Sources added / reviewed
- Added **Hacking-Tools (yogsec)** to the Toolbox as a reference link only, with an authorised-use note.
- Did NOT wire in `dinosn/exploit-watch-archive` (mirrors weaponised exploit/PoC code for unpatched
  bugs) or `AmadeusITGroup/PentestAssistant` (automated offensive pentesting) — both pull Siva away
  from being a safe, read-only defensive assistant. The defensive signal (which CVEs are exploited)
  already comes from CISA KEV / NVD / ThreatFox and now drives the alerts.

## NotebookLM
- NotebookLM has no public API to read/summarise URLs programmatically, so Siva summarises the blogs
  herself; the existing "Export for NotebookLM" button still packages sources for you to drop in.

Works on top of the original project or any earlier patch. No new npm packages.
Your .env.local and data/ folder are not touched; new store fields (sources, feedPrefs, alerts) are
created automatically with safe defaults on first read.
