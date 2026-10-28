# SIVA Sentinel patch 19 (cumulative: includes patches 02-18)

- Simple landing page in the dashboard theme (components/SivaLanding.tsx); removed the HUD landing (components/landing/*, intro + presenter videos).
- Voice-only: watchdog restarts "Hey Siva" listening, restart on tab focus, 8 s follow-up window after each answer, mic status shown on the landing (lib/sivaBus.ts replays the latest status).
- "Talk to Siva" button on the dashboard greets you; "Hey Siva, open the dashboard" leaves the landing page.
- tests/patch16.test.ts rewritten (148 tests).
