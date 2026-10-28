# SIVA Sentinel patch 08 (cumulative: includes patches 02-07)

- Live feed log (new sidebar item): table of every item read — S.No, Date, Day, Title, What matters,
  Source, Link. Search/filter/page/CSV. Kept in data/siva-store.json (latest 2,000, seeded from saved briefings).
- Real live numbers: Total stories shows items read in all (+new at last check); New today counts all
  items first read today; top bar shows "checked N x / +X new". (Cards used to be capped at the top 60.)
- Voice: fixed a mic restart loop (stale recogniser callbacks aborted each other); permission errors no
  longer disable hands-free permanently; mic keeps listening on every screen and "Hey Siva" returns Home;
  on-screen mic diagnostics, "I heard ..." line and a Mic check button.
- "Who are you?" / "what can you do": full introduction with real capabilities and limits.
- Voice commands "open the live feed log" / "open live sources".

No new npm packages. .env.local and data/ are not touched; the new feedLog field is created automatically.

## Addendum (08b)
- ALL five dashboard cards (Total stories, Exploited/KEV, Cyber news, New today) now count everything in the
  live feed log, so they move as feeds are checked; the card sub-line shows "+N at last check · M in briefing".
- Live refresh can now be 5 or 10 minutes (Settings -> Live mode), not only 15+.
