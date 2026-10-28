# SIVA Sentinel patch 06 (cumulative: includes patches 02-05)

Hands-free "Hey Siva" with no mic tap: "Always listen" is now ON by default, and the Home screen
arms the wake word on the FIRST click/keypress anywhere on the page (browsers forbid starting the
microphone with zero interaction on first load). After that it stays hands-free and auto-restarts;
on later visits, once the mic is allowed, it starts on its own. Clear on-screen state: a green
"Hey Siva on" pill, a red "mic is on" indicator, and plain wording instead of "Tap the mic".
Also includes the research report in docs/.

Works on top of the original project or any earlier patch. No new npm packages.
Your .env.local and data/ folder are not touched. If your SAVED settings had "Always listen" off,
turn it on once in Settings -> Siva's voice (it is on by default for new installs).
