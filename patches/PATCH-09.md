# SIVA Sentinel patch 09 (cumulative: includes patches 02-08)

A real cybersecurity brain for "Ask Siva".

- Root cause fixed: the "use ONLY DATA" rule made Gemini refuse general security knowledge. New expert
  rules: textbook knowledge from expertise; CVEs/numbers/dates/"latest" only from sources/search; defensive only.
- Answers are structured key points: In simple words, How it works, Key points, Real-world example, Why it
  matters, What to do, How to spot it, Latest, MITRE/CWE reference, Related terms. Bold lead words; spoken
  answer = simple explanation + top 3 key points. Older answers expandable; chat drawer shows key points.
- New free sources: MITRE ATT&CK mitigations + detection (technique found from plain words like "phishing"),
  MITRE CWE weaknesses + prevention, FIRST EPSS exploit probability. "CVE at a glance" box.
- Glossary 64 -> 130 terms.
- ATT&CK cache format v3: re-downloads once on the next refresh.

No new npm packages. .env.local and data/ untouched.
