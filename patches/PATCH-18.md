# SIVA Sentinel patch 18 (cumulative: includes patches 02-17)

- New landing page (components/SivaLanding.tsx, components/landing/*): intro video, plexus + particle-sea canvas, HUD panels and gauges from live data, presenter cut out of the user's video (VP9 alpha WebM loop, plays while Siva speaks), speech bubbles via lib/sivaBus.ts.
- Removed: Kage landing (public/landing-pages, components/threeui, KageScene), cartoon/photo presenters (CartoonSiva, CartoonPresenter, CartoonAvatarSettings, AvatarStage, lib/cartoonMotion, lib/cartoonAvatar, app/api/avatar, public/avatar/siva-photo.png). Run the cleanup command in the reply to delete them on your computer.
- Dashboard "Siva in 3D" switch replaced by "Meet Siva" (opens the landing presenter and greets).
- tests/patch16.test.ts and tests/patch17.test.ts rewritten (146 tests).
