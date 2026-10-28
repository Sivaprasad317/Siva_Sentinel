# SIVA Sentinel patch 21 (cumulative: includes patches 02-20)

ART brief
- ACT AS: senior voice-AI engineer building a personal, read-only cybersecurity assistant on Gemini.
- REQUEST: (1) obey the owner's own phrases exactly ("Hey Siva wake up" -> "Good morning boss"; "Hey Siva how was the day" -> "Good evening boss, day was good"), (2) stop reading on "Cool", (3) never greet automatically, (4) behave like a real assistant (Gemini/ChatGPT): multi-turn memory, short natural spoken answers, tools for the owner's data, web search for general facts.
- TERMS: free/local, key server-side, defensive only, no invented facts, tests for every rule.

How the big assistants do it (research) and what Siva now does
- Multi-turn context -> last 20 minutes of chat sent as real user/model turns.
- Function calling (Gemini functionDeclarations, AUTO mode; model turn returned unchanged so thought signatures survive; functionResponse matched by id) -> tools: search_my_news, get_todays_briefing, check_cve, get_threat_outlook, open_screen.
- Grounding with Google Search for general / current-events questions.
- Barge-in: a separate recogniser listens while Siva speaks, reacts on interim results, ignores Siva's own words (echo filter) and only accepts short stop phrases.
- Spoken style: answer first, 1-3 sentences, no markdown, no greeting.
- Next step if wanted later: Gemini Live API (native audio, built-in barge-in) via ephemeral tokens.

Files: lib/voiceCommands.ts, lib/chatRoute.ts, lib/converse.ts, lib/gemini.ts (geminiChat), lib/assistant.ts, lib/ai.ts, lib/validate.ts, lib/types.ts, lib/config.ts, components/HomeView.tsx, components/SettingsView.tsx, components/defaults.ts, tests/patch21.test.ts (158 tests).
