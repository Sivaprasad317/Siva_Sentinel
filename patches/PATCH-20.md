# SIVA Sentinel patch 20 — final (cumulative: includes patches 02-19)

ART brief used for this patch
- ACT AS: senior front-end engineer + product designer for SIVA Sentinel (Next.js, voice-first, read-only).
- REQUEST: make Home exactly the orb landing in the owner's screenshot (orb + rings, greeting, date, status, centred mic + keyboard, narrow icon rail), keep a separate Dashboard, recolour the Dashboard to the same navy/blue/violet/pink palette, and keep everything working hands-free.
- TERMS: no click needed for voice; no duplicate mics; one colour scheme; no removed features broken; all tests pass; one cumulative patch with cleanup steps.

Changes
- components/OrbHome.tsx (new Home), Dashboard: views home (orb) + overview (dashboard), NAV ◉ Siva (Home) / ◈ Dashboard, no landing overlay.
- HomeView: big Home mic and keyboard drive the voice engine through lib/sivaBus.ts (mic-click, typing, interim text).
- Colours: Patch 20 CSS block overrides the ember theme; charts use pink/violet/blue; Background3D back to blue/violet; Inter font.
- Removed components/SivaLanding.tsx.
- tests/patch16.test.ts updated (149 tests).
