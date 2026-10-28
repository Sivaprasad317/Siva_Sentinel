# SIVA Sentinel patch 04 (cumulative: includes patches 02 and 03)

New voice-first Home (big 3D orb, "Hey Siva" -> "Yes boss", "I am checking, boss" with live research
steps, answer cards with sources). Previous dashboard moved to "Intelligence dashboard".
Research pipeline: MITRE ATT&CK software + Malpedia malware families, Wikipedia, abuse.ch ThreatFox
(optional key), NVD/KEV, Gemini with Google Search grounding. One-step setup.ps1 and start-siva.ps1.

Works on top of the original project or any earlier patch. No new npm packages.
Your .env.local and data/ folder are not touched (setup.ps1 only ADDS new settings).
