# SIVA Sentinel patch 05 (cumulative: includes patches 02, 03 and 04)

Cybersecurity brain: a ~60-term plain-English glossary (lib/glossary.ts) wired into the research
pipeline and the AI system prompt, so Siva understands and always explains jargon.
Forgiving voice: fuzzy matching (lib/fuzzy.ts) for the "Hey Siva" wake word and for mis-typed /
mis-heard malware, actor and term names. Always-listen preference (wakeOnLoad) that turns the
microphone on automatically on the Home screen. gemini-4-argon recommended in .env.example.

Works on top of the original project or any earlier patch. No new npm packages.
Your .env.local and data/ folder are not touched (setup.ps1 only ADDS new settings).
