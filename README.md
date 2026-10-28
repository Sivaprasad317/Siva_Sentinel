# SIVA Sentinel: Security Intelligence & Vigilance Assistant

Siva collects **live** cybersecurity intelligence from official sources (the CISA Known Exploited Vulnerabilities catalog, the NVD CVE API, vendor advisories and security news RSS feeds). It ranks that intelligence by real-world risk and uses **Google Gemini** to explain it. You can say *"Hey Siva, what's the updates today?"*, and Siva reads the briefing aloud while a dark 3D dashboard (built with **three.js**) shows the evidence.

Siva is **read-only**. It researches and recommends defensive actions. It never scans, attacks or changes any system.

---

## 1. What you need (one-time setup)

| Thing | Why | Cost |
|---|---|---|
| **Node.js 22 LTS** | Runs the app | Free: https://nodejs.org (choose "LTS") |
| **Gemini API key** | AI summaries and answers | Free tier available: https://aistudio.google.com/apikey |
| NVD API key (optional) | Faster CVSS lookups (50 vs 5 requests per 30 s) | Free: https://nvd.nist.gov/developers/request-an-api-key |
| Chrome or Edge | Voice input | Free |

CISA KEV and the RSS feeds need no account or key.

**About cost:** with the default model (`gemini-3.5-flash-lite`), one refresh sends about 20 stories to Gemini. That is a small request, and it usually fits inside Google's free tier. Free-tier limits and paid prices change, so check https://ai.google.dev/pricing. The free tier may let Google use your prompts to improve its products. Siva only sends public news text plus your questions, never your keys or files.

---

## 2. Install and run (step by step)

Open a terminal (Windows: "Terminal" or "PowerShell"; macOS: "Terminal") **inside the unzipped `siva` folder**.

**Step 1: check Node is installed.** This prints the version; it should start with `v22`.
```bash
node -v
```

**Step 2: download the libraries the project uses** (Next.js, React, three.js). This creates a `node_modules` folder and takes a minute.
```bash
npm install
```

**Step 3: create your private settings file** by copying the example.
```bash
# macOS / Linux
cp .env.example .env.local
# Windows PowerShell
Copy-Item .env.example .env.local
```
Open `.env.local` in a text editor and replace `your-gemini-api-key-here` with your Gemini key. Optionally add `NVD_API_KEY`. Save the file.
`.env.local` stays on your computer. It is listed in `.gitignore`, so it is never committed to git.

**Step 4: run the tests** (optional, but a good habit). You should see `# pass 80` and `# fail 0`.
```bash
npm test
```

**Step 5: start Siva.**
```bash
npm run dev
```
Open **http://127.0.0.1:3000** in Chrome or Edge. Press **Refresh now**. The first refresh takes 1 to 2 minutes, because NVD limits how fast we can ask. To stop the server, press `Ctrl + C` in the terminal.

For everyday use you can run the faster production build instead:
```bash
npm run build   # compiles the app once (rerun after changing code)
npm start       # starts the compiled app on http://127.0.0.1:3000
```

> No keys yet? Click **Preview with sample data** on the empty dashboard. Sample items are clearly marked as fictional and are never saved.

---

## 3. Using Siva

- **Push to talk:** click 🎙, say *"Hey Siva, what's the updates today?"*, and Siva reads the briefing aloud.
- **Follow-up questions:** for example *"Which exploited bugs affect Cisco?"* or *"Tell me about CVE-2026-0322"*. Siva answers only from the collected stories and links its evidence ([1], [2]…). If the stories don't contain the answer, it says so.
- **Text chat** works in every browser (type below the orb).
- **Threat globe:** each glowing node is a story. Colour shows priority, and a pulsing ring means the item is exploited. Nodes are grouped by category, **not** by geography, because feeds rarely give reliable locations and Siva won't invent them. Drag to rotate, scroll to zoom, and click a node to open the story.
- **Story details:** each story shows its title, source, original link, publication time (or "Not provided"), retrieval time, summary (labelled AI or source text), why it matters, who is affected, why it was ranked there, verification notes, and every source that reported it.
- **History & search:** reopen any saved briefing, or search across all of them.
- **Settings:** set the daily briefing time and timezone (default 07:30 Asia/Kolkata), your topics, how many days to look back, and the voice speed and language.

### How ranking works (exploitation first, not just CVSS)
Siva scores every story with fixed, testable rules (`lib/prioritize.ts`) **before** any AI is involved:
- Listed in **CISA KEV** (exploitation confirmed): +50. Due date within 7 days: +10. Used by ransomware: +10.
- Exploitation reported in the news but not yet in KEV: +25, plus a "verify with the vendor" note.
- Ransomware +12, threat actor +8, breach +8, cloud +5.
- CVSS ≥ 9: +10 (≥ 7: +5). CVSS measures severity only, so on its own it can never make a story "critical".
- Reported by several outlets: up to +15. Matches your topics: +10. Freshness counts too: newer stories score higher, and stories with no publication date lose a few points.

### Voice compatibility
- **Speech recognition (voice input):** Chrome and Edge. Safari support is partial. Firefox is not supported, so use the text box. Chrome sends audio to Google's speech service, so it needs internet access.
- **Speech output:** all modern browsers. Available voices depend on your operating system.
- The microphone only works on `localhost`/`127.0.0.1` or on HTTPS sites. Allow microphone access when the browser asks.
- Hands-free wake-word detection ("Hey Siva" without pressing a button) is planned for a later phase.

### The daily scheduled briefing
The scheduler runs **inside the Siva server**. Every minute it checks whether your chosen time has passed in your timezone. If your computer was asleep at that time, it catches up once later the same day. It only runs while `npm run dev` or `npm start` is running. To keep it running all the time, see "Next steps" below.

---

## 4. How it works

```
Browser (Next.js page + three.js)                Server (Next.js API routes, on your computer)
 ├─ Dashboard, 3D globe, voice orb    ──fetch──▶  /api/briefing          latest / by id / sample
 ├─ Push-to-talk (Web Speech API)                 /api/briefing/refresh  start a refresh (rate limited)
 ├─ Text chat                         ──fetch──▶  /api/chat              grounded Q&A via Gemini
 └─ History, Settings                             /api/history, /api/preferences, /api/status
                                                     │
                       refresh pipeline (lib/refresh.ts)
  RSS feeds + CISA KEV ─▶ clean & validate dates ─▶ de-duplicate ─▶ link CVEs to KEV ─▶ NVD CVSS
        ─▶ rank (rules) ─▶ Gemini summary (JSON, validated) ─▶ save to data/siva-store.json
```

### What each file does
| Path | Purpose |
|---|---|
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | The web page shell and the dark theme |
| `components/Dashboard.tsx` | Main screen: banners, stats, briefing, filters, story list |
| `components/ThreatGlobe.tsx` | three.js 3D globe of stories (click and hover) |
| `components/SivaOrb.tsx` | three.js animated orb that shows listening, thinking and speaking |
| `components/AskSiva.tsx` | Push-to-talk, text chat, reading answers aloud |
| `components/StoryDetail.tsx` | Full evidence view for one story |
| `components/HistoryView.tsx`, `SettingsView.tsx` | History/search and preferences screens |
| `app/api/*/route.ts` | Server endpoints (they hold your keys; the browser never sees them) |
| `lib/config.ts` | List of feeds and sources, and reads `.env.local` |
| `lib/http.ts` | fetch with timeout and safe retries (only 429/5xx/network errors) |
| `lib/feedParser.ts`, `lib/normalize.ts` | RSS/Atom parsing, HTML stripping, date validation, de-duplication |
| `lib/sources.ts` | CISA KEV and NVD clients, with shape validation |
| `lib/prioritize.ts` | Ranking rules plus confidence and verification notes |
| `lib/gemini.ts`, `lib/ai.ts` | Gemini REST client, prompt-injection-safe prompts, fallbacks |
| `lib/refresh.ts`, `lib/scheduler.ts`, `lib/schedule.ts` | The pipeline, the daily scheduler and timezone maths |
| `lib/store.ts` | Local JSON storage (atomic writes) |
| `lib/validate.ts`, `lib/rateLimit.ts`, `middleware.ts` | Input validation, rate limits, optional password |
| `tests/` | 80 automated tests (parsing, de-duplication, ranking, API failures, scheduling, full pipeline, intel, scans, assistant) |

### Safety rules built in
- **No invented facts.** Gemini only receives the collected stories and must reply in JSON that refers to our story IDs. Unknown IDs are discarded. If Gemini fails, Siva shows text taken from the sources and labels it as such.
- **Untrusted content.** Feed text is stripped of HTML and scripts and wrapped as DATA. Gemini is told never to follow instructions inside it.
- **Secrets stay server-side.** Keys are read only in `lib/config.ts`, sent to Gemini in a header (never in a URL), and never exposed to the browser.
- **Local by default.** The server listens on `127.0.0.1`, so other devices can't reach it. If you ever expose it, set `APP_ACCESS_TOKEN` first (the browser will ask for username `siva` and that password).
- **Rate limits.** Refresh: 3 per 10 minutes. Chat: 20 per minute. Request bodies are size-limited and validated.

---

## 5. Patch 2: more sources, Jarvis mode, threat intel, scans, NotebookLM

### More sources
- **More news:** 13 more RSS feeds (The Record, Security Affairs, Help Net Security, CyberScoop, Infosecurity Magazine, The Register, Cybernews, ETCISO India, SANS ISC, Cisco Talos, Unit 42, the Microsoft Security Blog and Schneier). All are listed in `lib/config.ts`.
- **Hacker News:** read through the official Algolia API. Siva keeps only security stories with at least 15 points.
- **ransomware.live:** leak-site posts. These are claims made by the criminal groups. Siva adds one summary item, plus one item for each claim against an organisation in India.
- **Full articles:** Siva reads the full text of the top articles (`ARTICLE_READ_LIMIT`, default 15). It respects `robots.txt` and reads only links that came from the feeds; it does not crawl websites. For sites that block simple requests, you can add `SCRAPERAPI_KEY`.

### Threat intel
- Siva downloads the **MITRE ATT&CK** STIX data and the **MISP galaxy** threat-actor and ransomware clusters once a week (about 50 MB the first time) and caches them in `data/intel-index.json`.
- Stories are linked to known actors and to ATT&CK technique IDs. These links are found automatically and can be wrong, so they are labelled "auto-detected".
- When an actor has a matching profile in **crocodyli/ThreatActors-TTPs**, Siva links to it. It does not copy that repo's content, because the repo shows no licence.
- The new **Threat intel & OSINT** page lets you look up actors and techniques. It also holds the toolbox links (OSINT Jet, the start.me CTI page and others). Those sites have no API, so you open them yourself.

### Jarvis mode
The assistant now sits in a panel on the right of every page. It understands these commands:
- *"What's the update today?"* If the last briefing is older than 6 hours, Siva collects everything again and then reads the new briefing aloud.
- *"Top threats"*
- *"Read story 2"*
- *"Explain CVE-…"* (uses NVD and CISA KEV)
- *"Who is APT29?"* or *"What is T1059?"* (uses ATT&CK and MISP)
- *"Scan my website example.com"* or *"Scan image nginx:1.27"* (always asks you to confirm on screen first)
- *"Open scans"*
- *"Export to NotebookLM"*
- *"Speak slower"*
- *"Stop"*

**Hands-free mode:** press **Hands-free**, then say *"Hey Siva …"* or *"Jarvis …"*. This works in Chrome and Edge only. While hands-free is on, the microphone stays on, and Chrome sends the audio to Google's speech recognition service.

### NotebookLM
Google NotebookLM has no public API for asking questions or getting summaries. Its Enterprise API only manages notebooks and needs a Google Cloud licence. So Gemini writes the summaries inside Siva, and Siva gives you two ways to move a briefing into NotebookLM:
- **Export for NotebookLM:** downloads a Markdown source pack. In NotebookLM, upload that file as a source.
- **Copy all source URLs:** copies every article link. In NotebookLM, choose *Add source → Website* and paste them.

### Scans (defensive and read-only)
- **Website check:** a passive check of the TLS certificate, the HTTP→HTTPS redirect, security headers, cookie flags, version leaks and `security.txt`. It works **only** for domains you list in `SCAN_ALLOWED_DOMAINS`.
- **Trivy:** scans a container image, a git repository or a folder listed in `SCAN_ALLOWED_PATHS`. Install Trivy first (see below). Findings that appear in CISA KEV are shown first. Secret values are never stored.
- Every scan needs you to tick "I own this target or am authorised to scan it", and only one scan runs at a time.

### Installing Trivy on Windows (optional)
```powershell
winget install AquaSecurity.Trivy
trivy --version
```
If `winget` is not available, download the Windows zip from https://github.com/aquasecurity/trivy/releases, unzip it, and set `TRIVY_PATH=C:\path\to\trivy.exe` in `.env.local`. Image scans need Docker Desktop, or an image Trivy can pull from a registry.

## 6. Patch 3: live 3D dashboard, reports, history delete, Siva's new voice

### Live 3D dashboard
- The home page is now a live dashboard. It has a 3D animated background, cards that tilt in 3D, the 3D threat globe, and a scrolling ticker of critical headlines.
- **Top bar:** a LIVE indicator and an India-time (IST) clock.
- **Feed:** stories are grouped by day (Today, Yesterday…). Each one shows its source, tags, and a **NEW** badge when it was first seen in the latest refresh.
- **Detail panel:** Strategic assessment, Key highlights, Who is affected, Recommended action, Threat intel and Evidence.
- **Live mode** (Settings → Live mode) refreshes automatically, every 60 minutes by default. The dashboard updates itself and tells you how many new stories arrived. A live refresh replaces that day's previous live snapshot, so History doesn't fill up.

### Reports
Use **⬇ Report** in the top bar, or **Report** on any card in History:
- **Download full report (HTML):** one self-contained file with every story, its evidence, actions, source status and recent scans.
- **Save as PDF (print):** opens the report and shows the print dialog. Choose **Save as PDF**.

### History
- A **3D timeline**: column height shows the number of stories, the red part shows critical stories, and a purple ring means the briefing had KEV items. Click a column to open that briefing.
- **Delete** on each card, plus **Clear all history**. Both ask you to confirm first.
- **Clear conversation** empties the chat with Siva.

### Siva's voice
- Siva now picks a **female Indian-English voice** automatically and speaks warmly and kindly.
- **Best quality:** open Siva in **Microsoft Edge**. The voice is **Microsoft Neerja Online (Natural) - English (India)**.
- **Chrome on Windows:** add the English (India) speech pack (Windows Settings → Time & language → Speech → Add voices) to get **Microsoft Heera**.
- **Your own choice:** in Settings → Siva's voice, pick any voice, adjust speed and pitch, and press **Test voice**.

### Assistant
Siva lives behind the **Ask Siva** button in the bottom-right corner, on every page. Hands-free mode keeps listening even when the panel is closed.

## 7. Patch 4: voice-first Home, "Yes boss", research answers, one-step setup

### One-step setup and start
```powershell
.\setup.ps1        # first time (and after updates): checks Node, installs, asks for keys, runs tests
.\start-siva.ps1   # every day: starts Siva and opens it in Microsoft Edge
```
If Windows blocks the script, run `powershell -ExecutionPolicy Bypass -File .\setup.ps1`. Keys you type are hidden and saved only in `.env.local`.

### Home (the new main screen)
- **A clean, voice-first screen:** a big 3D orb, a greeting, one "Ask Siva anything" bar and suggestion chips.
- **Where things moved:** the previous dashboard is now the **Intelligence dashboard**, the second item in the left rail.
- **Push to talk (🎙):** Siva says **"Yes boss"**, then listens.
- **"Hey Siva" button (hands-free):** say *"Hey Siva"*, Siva says *"Yes boss"*, then ask your question. You can also say it all at once: *"Hey Siva, do you know about LockBit?"*
- **When you ask something:**
  - Siva says **"I am checking, boss"**, and the screen shows each research step as it really happens.
  - You then get an answer card: Simple explanation → Key facts → What to do → Sources.
  - Siva reads a short summary aloud.

### Where Siva looks (research sources)
| Source | Used for | Key |
|---|---|---|
| Today's collected stories | "What's the update today?" and related news | none |
| MITRE ATT&CK (groups, techniques, **software**) | threat actors, techniques, malware and tools | none |
| MISP galaxy (actors, ransomware, **Malpedia** malware families) | malware and actor background | none |
| NVD + CISA KEV | CVE details and whether a CVE is exploited | NVD key optional |
| Wikipedia | plain-English background | none |
| abuse.ch **ThreatFox** | "Is this IP / domain / URL / hash malicious?" | free `ABUSECH_AUTH_KEY` |
| **Gemini + Google Search** | current information, with web sources | your Gemini key |

When Google Search is used, the Google search suggestions appear under the answer, as Google's terms require. Grounded searches have their own free monthly allowance; after that, Google charges per search. Check https://ai.google.dev/pricing. To answer only from Siva's own sources, set `ENABLE_WEB_SEARCH=0`.

## 8. Patch 5: cybersecurity brain, always-listen, forgiving voice

### Siva now understands cybersecurity
- A built-in glossary of ~60 core security terms (phishing, ransomware, RCE, zero-day, CVE, CVSS, C2, lateral movement, MFA, EDR and more), each with a plain-English, beginner-friendly meaning.
- When you ask "what is X?" or use a term, Siva defines it in simple words first (an "In simple words" box), then adds live context.
- Her AI instructions now tell her to always explain every acronym and jargon word the first time, and never assume you know it.

### Always listen for "Hey Siva" (no clicking)
- New setting: **Settings → Siva's voice → "Always listen for Hey Siva"**. Turn it on once.
- After that, whenever the Home screen is open in Chrome or Edge, the microphone turns on by itself. Just say "Hey Siva" and she answers "Yes boss".
- A clear red dot shows while the mic is live, and one click turns it off. (The browser may ask for microphone permission the first time; allow it.)

### Understands mispronounced / mis-heard words
- Fuzzy matching: "Hey Shiva / Saiva / Civa" still wakes her.
- A mis-typed or mis-heard malware or group name still finds the right one (for example "cobaltstrike" → Cobalt Strike, "lockbite" → LockBit), and a misspelled term ("fishing" → phishing) still gets defined.
- Gemini is also told to interpret likely speech-to-text mistakes.

### Model
- `gemini-4-argon` is now the recommended model in `.env.example` (most capable). Change `GEMINI_MODEL` in `.env.local` any time; model names are listed at https://ai.google.dev/gemini-api/docs/models.

### A note on the Hermes agent
I did not bolt the Hermes agent framework onto the project. It runs a different model in a different language, and wiring it in would not make Siva better at understanding security or news — which was the real goal. This patch solves that goal directly with the security brain and the improved voice. If you want one specific Hermes capability later, tell me the exact thing it should do.

## 9. Patch 6: true hands-free "Hey Siva"

- **Always listen** is now ON by default. On the Home screen the wake word arms on your **first click or key-press anywhere** on the page — browsers do not allow a site to switch on the microphone with zero interaction on the very first load, so one gesture is unavoidable. After that single click you never tap again: the mic stays on, auto-restarts if it drops, and on later visits (once you've allowed the mic) it starts on its own.
- Clear on-screen state: "Click anywhere once to switch on 'Hey Siva' — then you never tap again", changing to "Listening… just say 'Hey Siva'" with a red mic dot once live.

## 10. Patch 7: live sources you control, and critical alerts

### Many more feeds, all editable
- Siva now ships with your full threat-intel feed list (~135 blogs and research feeds) built in. A curated ~30 are **on by default** so refreshes stay fast; the rest are one click away.
- New **Live sources** screen (📡 in the sidebar, under Intelligence): see every feed, switch any on or off, **add your own feed** by name + URL, remove the ones you added, filter the list, and see each feed's last-fetch result (how many items, or "failed"). **Enable all** / **Disable seed feeds** buttons flip the whole seed list at once.
- Your choices are saved in Siva's data store (`data/siva-store.json`), so they survive restarts and you can change them any time. The built-in core feeds can't be removed, only disabled.
- A quick note on "read every minute": a polite refresh interval is kinder to the publishers and avoids rate-limit bans, and feeds are fetched with limited concurrency (8 at a time) so a long list doesn't stall. Siva reads the enabled feeds on every refresh of your live-mode schedule.

### Critical alerts
- New 🔔 bell in the top bar. Siva raises an alert whenever a **new** item is *exploited in the wild* (on CISA's Known Exploited Vulnerabilities list) or rated **critical** — not for routine news.
- A badge shows unseen alerts; the dropdown lists them with severity, CVE and age, and clicking one opens the story.
- Optional **desktop notifications**: tick "Notify" in the bell and allow the browser prompt, and Siva will pop a desktop notification for new critical items even when you're on another tab — so you don't have to watch the screen. The first load never floods you with the existing backlog.

### Sources added / reviewed
- **Hacking-Tools (yogsec)** added to the Toolbox as a *reference link only*, with a clear note to use any tool strictly on systems you own or are authorised to test.
- I did **not** wire in `dinosn/exploit-watch-archive` or `AmadeusITGroup/PentestAssistant`. The first mirrors weaponised exploit/PoC code for unpatched bugs, and the second automates offensive pentesting — both pull Siva away from being a safe, read-only *defensive* assistant. The defensive signal you actually want (which CVEs are being exploited) already comes from CISA KEV, NVD and ThreatFox, and now drives the alerts above.

### NotebookLM, honestly
- NotebookLM has no public API to read or summarise URLs programmatically, so Siva can't "drive" it live. Instead Siva reads and summarises the blogs herself (her own live pipeline) and the existing **Export for NotebookLM** button packages sources so you can drop them into NotebookLM yourself if you like.

## 11. Patch 8: live feed log, real live numbers, voice fixes, "who are you"

- **Why the numbers never changed:** the dashboard cards describe the *top 60* stories of the latest briefing, and the briefing is rebuilt on the live schedule (every 60 minutes by default). So "60 total" stays 60 by design. Now: *Total stories* also shows how many items Siva has read in all (+how many were new at the last check), *New today* counts everything first read today, and the top bar shows "checked N× · +X new". Set a shorter interval in Settings → Live mode if you want faster updates.
- **Cards now count everything read:** Total stories, Exploited (KEV), Cyber news and New today are computed from the whole live feed log, and the card shows "+N at last check · M in briefing". They update when a check finishes; choose Settings → Live mode → every 5 or 10 minutes for the fastest movement.
- **📋 Live feed log** (new sidebar item): one table of every item Siva has read, newest first — **S.No, Date, Day, Title, What matters, Source, Link**. Search, filter by source/severity, page through, download as CSV. It reloads itself every minute. The log is kept in `data/siva-store.json` (latest 2,000 items) and is filled from your saved briefings the first time.
- **Voice ("Hey Siva") fixes:** (1) a restart loop made the mic stop and start every fraction of a second, so it never heard a full sentence — fixed. (2) A refused/early permission error used to switch hands-free off for good — now it waits for your click instead. (3) The microphone now keeps listening on *every* screen, not only Home; say "Hey Siva" anywhere and she brings you back to Home to answer. (4) New on-screen diagnostics: whether the mic is on, what she *heard* (so you can see if the words arrive), the exact reason when it is blocked, and a **🎤 Mic check** button.
- **"Who are you?"** (also "what can you do", "introduce yourself"): Siva now explains what she is, her real capabilities (based on your actual setup) and her limits.

## 12. Patch 9: a real cybersecurity brain for "Ask Siva"

- **Why answers were thin:** Siva's AI rules said "use ONLY facts in the collected data". So for a plain question like "what is SQL injection?", Gemini refused to use what it knows and answered "not known from sources". Now Siva works as a **senior security expert and teacher**: textbook knowledge (what something is, how it works, how to detect and stop it, frameworks like MITRE ATT&CK, CWE, OWASP, NIST CSF) comes from expert knowledge, while **time-sensitive facts** (CVEs, scores, dates, victims, "latest") still come only from sources and Google Search — never invented.
- **Answers are organised as key points:** 💡 In simple words → ⚙️ How it works → 📌 Key points → 🌍 Real-world example → ⚠️ Why it matters → ✅ What to do → 🔎 How to spot it → 🗞️ Latest from the news → 📚 MITRE / CWE reference → 🔗 Related terms. Each bullet is one idea with the key word in bold. Siva *speaks* the simple explanation plus the top 3 key points; the full detail is on screen. Older answers can be expanded with "Show full answer"; the chat drawer also shows key points now.
- **New free knowledge sources (no keys):** MITRE ATT&CK **mitigations and detection guidance** for every technique (asking "what is phishing" now finds ATT&CK T1566 and its mitigations); **MITRE CWE** weakness details and prevention (for "SQL injection", "XSS", "SSRF"… and for a CVE's weakness type from NVD); **FIRST EPSS** — the probability a CVE will be exploited in the next 30 days. CVE questions get a "CVE at a glance" box: CVSS, CISA KEV status and due date, ransomware use, EPSS, publish date and weakness type.
- **Glossary doubled** to 130 plain-English terms (Kerberoasting, BEC, MFA fatigue, SSRF, web shell, living off the land, passkeys, SBOM, EPSS, CERT-In, NIST CSF, and more).
- The ATT&CK data re-downloads once automatically (format v3) on the next refresh to pick up mitigations.

## 13. Patch 10: Threat Graph — connect the dots

- New **🕸️ Threat graph** screen (sidebar → Intelligence). A 3D map of the real things named in the news — 🔴 hacker groups, 🟠 malware & tools, 🟣 CVEs, 🔵 vendors, 🟢 ATT&CK techniques. A line means the same stories mention both; thicker = more stories; a red ring = CISA confirms the CVE is exploited. Drag to rotate, scroll to zoom, click a ball to see its connections, numbers (stories, this week, last week, links) and the **evidence stories** behind every link. Filter by 7/30/90 days and by type, search by name, hide weakly-linked items. No WebGL? A flat 2D map of the same layout is shown.
- **🔮 Threat outlook** at the top: this week vs last week — most active group, exploited CVE in the news, vendor under the most pressure, strongest links, new names, and "rising" chips. It is built only from real stories: **trends, not predictions**.
- **New voice questions:** "What's the threat outlook this week?", "What's trending?", "Which groups are targeting Microsoft?", "Which malware is hitting Fortinet?", "Which bugs affect Cisco?", "What's connected to LockBit?", "What's linked to CVE-2024-3400?", "Open the threat graph". Answers include an **Open in Threat Graph** button.
- Normal research answers ("Who is APT29?", "Explain CVE-…") also get a **Connected in the news** section from the graph.
- Built from your saved briefings plus the live feed log; free, local, no new keys, no extra Gemini calls. A shared story is evidence of a link, not proof of an attack — always check the sources.
- Why not MiroFish: it simulates and *predicts* with hundreds of AI agents (costly, needs Python + Zep Cloud, AGPL-3.0). Siva borrows its best idea — a knowledge graph — but keeps it factual and free.

## 14. Patch 11: duplicate-key fix, every source really read, Siva's reading memory, always-on

- **Fixed the red "two children with the same key `SecurityWeek`" error.** SecurityWeek was listed twice (built-in feed + the seed list's home-page URL). Sources are now unique by name (built-in wins), and the table keys can never clash again.
- **82 of the sources were web pages, not feeds — they were silently reading nothing.** Siva now does *feed auto-discovery*: when a URL is a blog home page, she finds the RSS/Atom feed the page advertises and reads that. The Sources screen shows these as "page → auto feed".
- **Google News feeds added (on by default):** Cybersecurity, Vulnerabilities & patches, Ransomware & breaches, India cyber (CERT-In). This catches big stories from publishers not in your list (for example Patch Tuesday round-ups). Each story is credited to the real publisher.
- **Siva's reading memory:** when you ask anything, she now searches *everything she has read* (latest 2,000 items, with dates) — not only the top-60 briefing. She understands "today", "yesterday", "this week", "last 6 hours", "latest". Answers show a "From my reading" section with dates and sources, and Gemini is told to use what she read first.
- **She keeps herself current:** if her reading is more than 2 hours old when you ask, she starts re-reading all sources in the background and tells you. "What's the update today?" refreshes if the briefing is older than 2 hours. Settings → Live mode now also offers "every 3 hours".
- **Always-on (optional):** run `.\install-autostart.ps1` once. Siva then starts by herself, hidden, every time you log in to Windows, and keeps reading on her live schedule even when no browser is open. Remove with `.\install-autostart.ps1 -Remove`. Log: `data\siva-server.log`. (Don't run `npm run dev` at the same time — both use port 3000.)

## 15. Patch 12: clean Home — just the mic, centred

- Removed the suggestion chips ("What's the update today?", "Top threats right now", …) and the long hint sentences under the bar.
- Home now shows one large mic button in the **bottom-right corner** (patch 13; it was centred in patch 12): say "Hey Siva", or tap it to talk. A green ring means she is listening for "Hey Siva".
- Want to type instead? Tap the small ⌨ button just left of the mic and a text box pops up above it (it is shown automatically in browsers without voice).
- "Hey Siva" hands-free stays on by default; switch it in Settings → Siva's voice → Always listen. Microphone problems still show a short message with a 🎤 Mic check button.

## 15b. Patch 14: 3D Siva (he walks in and talks), Indian man's voice, Reports corner, tiny animated mic

- **3D Siva switch (top-right of Home, ON/OFF).** Turn it ON and a young man (25-30, navy blazer, white tee) walks out of the fog along a lit runway, slows into the spotlight, waves and greets you by the time of day: "Hey, good morning boss! Siva here. Tell me, what shall I check for you?". Then just speak — no wake word needed for that first question. He leans in and tilts his head while listening, puts a hand to his chin while thinking, and talks with his hands (lips move with the words) while answering. The switch is remembered in this browser.
- **Cinematic stage:** night sky with aurora and stars, glowing city skyline, light pillars along his path, a volumetric spotlight, holographic threat panels, drifting dust and bloom glow. The floor ring changes colour with his state (cyan idle, green listening, blue thinking, pink speaking) and ripples while he listens. Drag to orbit the camera, scroll to zoom; his head follows your pointer.
- **Answers are not shown over him.** Click **📄 Reports** (top-right corner) to read every answer with its sources and **⬇ Download** one or all as an HTML report (open it and Print → Save as PDF if you need a PDF). 👁 View opens it in a new tab.
- **Photo-real face (optional):** the built-in man is a stylised 3D character drawn in code. For a realistic person, put any rigged `.glb` human with Idle/Walk animations at `public/avatar/siva.glb` (for example a free Mixamo character + animations exported to .glb with Blender). Siva uses it automatically.
- **Voice is now an Indian man.** Automatic choice: Microsoft Edge → "Microsoft Prabhat Online (Natural) - English (India)"; Windows → "Microsoft Ravi" (add the English (India) speech pack); macOS → "Rishi". If no male voice exists, the nearest voice is lowered so it still sounds like a man. Persona: friendly, clear Indian English with a light touch of "boss", "see", "no tension" — never slang that hides the meaning. Switch back in Settings → Siva's voice is a… → Woman.
- **Tiny mic + ⌨ in the bottom-left corner on every screen** (Home and all dashboards). Green ripples + level bars = listening; the mic bounces with pink bars = Siva talking; a spinning ring = thinking; small green dot = waiting for "Hey Siva". After you speak, a bubble shows "✓ Got it: …" so you know he heard you right.

## 15c. Patch 15: one cinematic dashboard, Siva with your face, no more "Namaste"

- **One dashboard.** "Siva (Home)" and "Intelligence dashboard" are now a single **Dashboard**, in a dark, ember-lit, cinematic style: warm charcoal, ember orange and lantern amber, serif headings (Shippori Mincho; Georgia when offline), glowing embers in the background.
- **Charts** (all live, from everything Siva has read): stories per day for 14 days stacked by severity (hover a day for the numbers), this week's severity mix, the top reporting sources, and the most-mentioned CVEs (click one to filter the stories). The stat cards, AI brief, 3D globe and story feed are still below.
- **Siva in 3D switch** (in the greeting panel). Turn it ON and Siva comes out of the dark towards you, stops in front of you and says "Good evening, boss. I am Siva. How can I help you today?", then listens. He uses **your photo** (`public/avatar/siva-photo.png`): it materialises like a warm hologram as he comes closer, then shows your real face with lips that move with the words and natural blinking. `✕ Dashboard` switches him off. A rigged `public/avatar/siva.glb`, if you add one, is used instead.
- To use a different photo: replace `public/avatar/siva-photo.png` with a front-facing photo with the background removed (PNG with transparency), keeping the face in the same place, or tell Siva's developer to re-mark the mouth/eye positions in `components/AvatarStage.tsx` (`PHOTO`).
- **Answers** open in the Reports drawer (📄, also next to the tiny mic in the bottom-left on every screen) where you can view or download them.
- **No more "Namaste"**: removed from Siva's instructions and stripped from anything already saved.
- The old floating "Ask Siva" button and side drawer are gone; the tiny mic does everything.

## 15d. Patch 16: Kage landing page + cartoon Siva

- **Landing page:** the app now opens on ThreeUI's **Kage** landing page (MIT, from github.com/MengTo/threeui, commit 68802d5), used exactly as its usage snippet (`<KageLandingPage headingFont="onest" … primaryColor="#e0231c" />` inside `.shader-frame`). `public/landing-pages/kage.html`, `three.min.js`, `fonts.css` and all 14 images are byte-for-byte copies; `tests/patch16.test.ts` checks every SHA-256. Press **Enter SIVA** (bottom-right) to open the dashboard; click the SIVA logo in the sidebar to come back. The page's own text (Kyoto temple walk) is unchanged, because the source must stay byte-exact.
- **Cartoon Siva:** "Siva in 3D" now shows an illustrated cartoon drawn from your photo (big swept-back wavy hair, thick brows, moustache and short beard, navy blazer over a black turtleneck). He walks from far away towards you in perspective, stops in front of you, waves, says "Good evening, boss. I am Siva. How can I help you today?", then listens (head tilt), thinks (eyes up, hands together) and talks (mouth + hands move with the words). He blinks and his eyes follow your mouse.

## 15e. Patch 17: landing page fix + Pixar-style cartoon Siva

- **Fixed "127.0.0.1 refused to connect"** on the landing page: Siva sent `X-Frame-Options: DENY`, which also blocked its own landing page frame. It is now `SAMEORIGIN` + `frame-ancestors 'self'`: Siva can show its own page, other websites still cannot frame Siva.
- **Cartoon Siva like an animated film:** Settings → Cartoon Siva.
  - Option 1: **✨ Create my cartoon with Gemini** — sends your photo to Gemini's image model (`GEMINI_IMAGE_MODEL`, default `gemini-3.1-flash-image`). Google may require billing for image models.
  - Option 2 (free): copy the prompt, make the picture in the Gemini app (gemini.google.com) with your photo, then **Upload my cartoon**.
  - Drag the three markers onto the eyes and mouth and press **Save** — Siva then talks (mouth opens with the words), blinks, and glides in from the distance when you switch "Siva in 3D" on. A flat magenta background is removed automatically.
  - Your own photo for option 1 can be replaced by putting `data/avatar/my-photo.png` (or `.jpg`). Files stay in `data/avatar/` on your computer.

## 15f. Patch 18: the SIVA landing page (from Siva's intro video)

- The Kage temple page and the cartoon/photo presenters are gone. The app now opens on **your own landing page**: your intro video plays once (Skip intro), then a live holographic HUD — plexus sky, rolling particle sea, glass panels with real numbers (threat activity, severity mix, top sources, live signals), a gauge cluster (new today, critical, threat-level speedometer, exploited, sources) — and **you in the middle**, cut out of the video. When Siva speaks you talk (the video plays); speech bubbles show what you asked and what he answered.
- **Talk to Siva** (or **Meet Siva** on the dashboard) greets you by time of day and listens. **Open dashboard** goes to the charts; click the SIVA logo in the sidebar to come back.
- Files: `public/avatar/siva-presenter.webm` (transparent loop), `siva-presenter.webp` (still), `siva-intro.mp4` (intro). To use a new video later, ask for the cut-out to be redone.

## 15g. Patch 19: simple landing page + truly voice-only

- The landing page is now simple and in the dashboard's colours (warm charcoal, ember orange): greeting, a voice status pill (Listening / Speaking / Checking), what you asked and what Siva answered, today's Critical / Exploited / New-today numbers, and **Open dashboard**. No video, no 3D.
- **No mic clicks:** "Hey Siva" starts by itself when the page opens, a watchdog restarts it every few seconds if Chrome stops it, it restarts when you come back to the tab, and after every answer you have 8 seconds to ask a follow-up without saying "Hey Siva" again. "Hey Siva, open the dashboard" opens it.
- One-time Chrome setting so it never asks again: click the icon left of `127.0.0.1:3000` → Site settings → Microphone → **Allow**.

## 15h. Patch 20 (final): Siva Home is back + one colour scheme

- **◉ Siva (Home)** is the landing page again, exactly the original look: the purple 3D orb with rings, "Good afternoon, Boss", the date and time, the live status ("Listening… just say “Hey Siva”") and the big pink-violet mic with the ⌨ button next to it, on the navy background with the narrow icon sidebar.
- **◈ Dashboard** keeps all the charts, cards, AI brief, 3D globe and stories — now in the same navy / blue / violet / pink colours as Home.
- **Voice only:** listening starts by itself, restarts itself if Chrome stops it, and after each answer you can ask a follow-up without "Hey Siva" for 8 seconds. The mic is only a backup. Answers open in Reports (📄) where you can view or download them.

## 15i. Patch 21: your own phrases, "Cool" to stop, and a real conversational AI

- **Your phrases (Settings → My voice commands):** "Hey Siva, wake up" → "Good morning boss". "Hey Siva, how was the day" → "Good evening boss, day was good". Add or change your own. Siva never greets on his own any more (no automatic "Good morning" in briefings or answers).
- **Stop him mid-sentence:** say **"Cool"** (or "stop") while he is reading and he stops at once. He ignores his own voice.
- **Real AI conversation, like Gemini / ChatGPT voice:** everyday questions and follow-ups ("and how do I stop it?") now get a short, natural spoken answer that remembers the last 20 minutes of conversation. Siva uses **tools** (Gemini function calling) when the question is about your data — today's briefing, the news he has read, CVE checks (CISA KEV + EPSS + NVD), this week's threat outlook, opening a screen — and **Google Search** for general or current facts. Deep security topics still get the full research card in Reports.

## 16. Troubleshooting
| Symptom | Fix |
|---|---|
| Banner says "AI summaries are off" | Add `GEMINI_API_KEY` to `.env.local`, then stop (`Ctrl+C`) and start the server again. |
| "Gemini model not found (404)" | Model names change. Set `GEMINI_MODEL` to a current one from https://ai.google.dev/gemini-api/docs/models |
| "Gemini quota … (429)" | Free-tier limit reached. Wait, or enable billing in Google AI Studio. |
| A feed shows "Failed" in Source status | That publisher may have changed its feed URL. Disable it (or fix its URL) on the **Live sources** screen, or add the corrected feed there. The rest still works. |
| Refresh got slow after "Enable all" | That's expected with ~135 feeds. Use **Disable seed feeds** on the Live sources screen to drop back to the core set. |
| Refresh is slow | Add a free `NVD_API_KEY`, or lower `NVD_MAX_LOOKUPS`. |
| "Hey Siva" does not react | Use Chrome/Edge at `http://127.0.0.1:3000`. Look at the grey text under the orb: it says whether the mic is on and what she heard. Press **🎤 Mic check**. Chrome's speech needs internet; Brave blocks it by default. |
| 3D Siva shows only a glow, no man | Your browser has WebGL off. In Chrome/Edge open Settings → System → turn on "Use graphics acceleration", then reload. |
| He walks in but says nothing | Browsers block speech until you click the page once. Click anywhere (or toggle 3D Siva OFF/ON). |
| Mic button does nothing | Use Chrome/Edge, open the site via `http://127.0.0.1:3000`, and allow the microphone. |
| `npm install` fails | Check `node -v` is 22 or newer. |

All data lives in `data/siva-store.json`. Deleting that file resets history, chat and settings; it is your choice and not needed normally.

---

## 17. Next steps (later phases)
1. **Always-on scheduling:** run `npm start` as a background service (for example with `pm2`, Windows Task Scheduler or a macOS LaunchAgent), or deploy and use a hosted cron job.
2. **Supabase/PostgreSQL:** replace `lib/store.ts` with a Supabase-backed version when you want multi-device access. The rest of the app doesn't change.
3. **Hands-free wake word** ("Hey Siva" without a button), using an on-device wake-word engine.
4. **Deployment** (e.g. Vercel): requires `APP_ACCESS_TOKEN` or proper login first, a hosted database instead of the JSON file, and Vercel Cron instead of the in-process scheduler.
5. **More sources:** add India's CERT-In or other vendor feeds in `lib/config.ts`. Only use official RSS/APIs and respect their terms.
