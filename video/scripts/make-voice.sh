#!/usr/bin/env bash
# Generates the two demo voices with Piper (free, offline neural TTS):
#   public/voice/user.wav  - "Hey Siva, what's today's updates?"   (male US voice "ryan")
#   public/voice/siva.wav  - Siva's briefing                         (British voice "alan")
# Needs: Python 3 and `pip install piper-tts`. Voice models download once from the Piper GitHub releases.
# Prefer your own voice for the question? Record it as public/voice/user.wav instead and skip that step.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .voices public/voice
get() { # $1 = release file name
  [ -f ".voices/$1" ] || curl -fsSL "https://github.com/rhasspy/piper/releases/download/v0.0.2/$1" -o ".voices/$1"
  tar -xzf ".voices/$1" -C .voices
}
get voice-en-us-ryan-high.tar.gz
get voice-en-gb-alan-low.tar.gz

line() { node -e "const s=require('fs').readFileSync('src/script.ts','utf8');const m=s.match(new RegExp('$1 =\\\\s*\"([^\"]+)\"'));process.stdout.write(m[1])"; }

line USER_LINE | python3 -m piper -m .voices/en-us-ryan-high.onnx --length-scale 0.95 -f public/voice/user.wav
line SIVA_LINE | python3 -m piper -m .voices/en-gb-alan-low.onnx --length-scale 1.0 --sentence-silence 0.25 -f public/voice/siva.wav

for f in public/voice/user.wav public/voice/siva.wav; do
  printf '%s: %ss\n' "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
echo "Done. Check the durations fit src/script.ts (user: 2.5 s window, Siva: 14 s window), then render."
