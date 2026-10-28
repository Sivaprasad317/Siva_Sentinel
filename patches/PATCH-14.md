# SIVA Sentinel patch 14 (cumulative: includes patches 02-13)

- 3D Siva (ON/OFF switch on Home): a young man walks in from the back, slows into a spotlight, waves and greets you by time of day, then listens; listening/thinking/speaking body language with lip movement.
- Cinematic three.js stage: sky + aurora + stars, city skyline, light pillars, volumetric beam, holographic panels, dust, bloom; drag/zoom camera; head follows pointer.
- Answers are spoken, not shown over him; 📄 Reports corner: view + download (HTML, printable to PDF) one or all answers.
- Optional public/avatar/siva.glb for a photo-real character (auto-detected, lip-sync via morph targets / jaw bone).
- Voice: Indian man by default (Prabhat > Ravi > Rishi), pitch lowered if no male voice exists; persona updated; Settings → voice gender.
- Tiny animated mic + keyboard in the bottom-left corner on every screen, with "✓ Got it: …" feedback.
- New: components/AvatarStage.tsx, lib/avatarMotion.ts, lib/answerReport.ts, tests/patch14.test.ts (139 tests).
