# SIVA Sentinel patch 10 (cumulative: includes patches 02-09)

Threat Graph — connect the dots (the useful idea from MiroFish, kept factual and free).

- New "Threat graph" screen: 3D map of hacker groups, malware/tools, CVEs, vendors and ATT&CK techniques,
  linked when the same stories mention them (weight = number of stories, evidence kept for every link).
  Click for connections + stats + evidence stories. 7/30/90 days, type filters, search, min-links filter.
  2D fallback without WebGL. Deterministic layout.
- Threat outlook: this week vs last week (rising, new, most connected, strongest links). Trends, not predictions.
- Voice/chat: "threat outlook", "what's trending", "which groups are targeting X", "which malware is hitting X",
  "which bugs affect X", "what's connected to X", "open the threat graph". "Open in Threat Graph" button.
- Research answers get a "Connected in the news" section.
- Built from saved briefings + live feed log. No new packages, keys or Gemini calls.
