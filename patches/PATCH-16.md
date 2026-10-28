# SIVA Sentinel patch 16 (cumulative: includes patches 02-15)

- Landing page: ThreeUI KageLandingPage, exact source from github.com/MengTo/threeui@68802d5 (MIT).
  - public/landing-pages/kage.html + secret-pathways-assets/** byte-exact (hashes match the registered revision; verified in tests/patch16.test.ts).
  - components/threeui/landing-pages/{LandingPages.tsx,pageTypography.ts,pageRecipes.ts} copied unmodified from the repo.
    pageTypography.ts matches the registered hash; LandingPages.tsx and pageRecipes.ts are the repo's multi-page versions (hashes differ from the registered single-page revision).
  - components/KageScene.tsx = the configured <Scene/> usage; "Enter SIVA" button sits outside the frame.
- Cartoon Siva (components/CartoonSiva.tsx, CartoonPresenter.tsx, lib/cartoonMotion.ts): SVG character drawn from the owner's photo, walks in with perspective, waves, greets, listens/thinks/talks, blinks, eye-follow.
- tests/patch16.test.ts (145 tests).
