# SIVA Sentinel patch 17 (cumulative: includes patches 02-16)

- next.config.mjs: X-Frame-Options SAMEORIGIN + CSP frame-ancestors 'self' (fixes the blank "refused to connect" landing page).
- Pixar-style cartoon Siva: lib/cartoonAvatar.ts (ART prompt, request/response, face geometry), app/api/avatar (generate/upload/face/delete) + app/api/avatar/image, components/CartoonAvatarSettings.tsx (create, upload, drag eye/mouth markers).
- AvatarStage: talking-portrait mode with calibrated face points, automatic flat-background key + despill, soft bottom edge.
- CartoonPresenter uses the cartoon portrait when present; falls back to the drawn cartoon.
- tests/patch17.test.ts (150 tests).
