# Siva patch 02

Adds: 13 more news feeds, Hacker News (Algolia API), ransomware.live leak-site claims, full-article reading (robots.txt aware, optional ScraperAPI), MITRE ATT&CK + MISP galaxy actor/technique linking with crocodyli TTP profile links, Jarvis-style assistant (commands + hands-free wake word + auto-refresh on "what's the update today"), NotebookLM export, passive website checks and Trivy scans (allowlist + confirmation), Threat intel & OSINT page, Scans page.

New files: app/api/assistant/route.ts, app/api/scan/route.ts, app/api/intel/route.ts, app/api/export/notebooklm/route.ts, components/IntelView.tsx, components/ScanView.tsx, lib/article.ts, lib/assistant.ts, lib/assistantRouter.ts, lib/extraSources.ts, lib/intel.ts, lib/notebooklm.ts, lib/scan.ts, tests/patch2.test.ts, patches/PATCH-02.md

Changed files: .env.example, README.md, app/api/status/route.ts, app/globals.css, components/AskSiva.tsx, components/Dashboard.tsx, components/SettingsView.tsx, components/StoryDetail.tsx, lib/ai.ts, lib/config.ts, lib/prioritize.ts, lib/refresh.ts, lib/sources.ts, lib/store.ts, lib/types.ts

No new npm packages. Your .env.local and data/ folder are not touched.
