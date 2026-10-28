#!/usr/bin/env bash
# Generates the two demo voices with Piper (free, offline neural TTS):
#   public/voice/user.wav  - "Hey Siva, what's today's updates?"   (male US voice "ryan")
#   public/voice/siva.wav  - Siva's briefing                         (US voice "lessac")
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
get voice-en-us-lessac-medium.tar.gz

line() { node -e "const s=require('fs').readFileSync('src/script.ts','utf8');const m=s.match(new RegExp('$1 =\\\\s*\"([^\"]+)\"'));process.stdout.write(m[1])"; }

line USER_LINE | python3 -m piper -m .voices/en-us-ryan-high.onnx --length-scale 0.95 -f public/voice/user.wav
line SIVA_LINE | python3 -m piper -m .voices/en-us-lessac-medium.onnx --sentence-silence 0.35 -f public/voice/siva.wav

# Even out loudness and leave headroom so the voices never clip over the music.
for f in public/voice/user.wav public/voice/siva.wav; do
  ffmpeg -loglevel error -y -i "$f" -af "loudnorm=I=-16:TP=-1.5:LRA=7" -ar 48000 "$f.tmp.wav" && mv "$f.tmp.wav" "$f"
done

# Sync the captions to the new audio.
node scripts/align-voice.mjs
echo "Done. Render with: npx remotion render SivaPromo out/siva-sentinel-linkedin.mp4"
