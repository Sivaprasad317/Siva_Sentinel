# SIVA Sentinel patch 15 (cumulative: includes patches 02-14)

- One main Dashboard (Home + Intelligence merged), cinematic ember theme (Kibori-inspired), serif display font.
- Charts from the live feed log: 14-day stacked activity, severity mix, top sources, top CVEs (lib/dashboardStats.ts, components/DashboardCharts.tsx).
- "Siva in 3D" switch in the hero; presenter is a full-screen overlay. Uses public/avatar/siva-photo.png (the user's photo, background removed) as a hologram-to-real portrait with lip-sync and blink; .glb still preferred if present; no-WebGL fallback shows the photo.
- Greeting: "Good evening, boss. I am Siva. How can I help you today?"
- "Namaste" removed from prompts and stripped from spoken/displayed text.
- Removed the duplicate Ask Siva drawer/fab; Reports also reachable from the mic dock.
- tests/patch15.test.ts (143 tests).
