# Siva Sentinel: LinkedIn promo video

A 60-second, 1080×1350 (4:5, best for the LinkedIn feed) video made with [Remotion](https://remotion.dev).

Scenes: hook → intro → voice demo ("Hey Siva, what's today's updates?") → how it works →
ranking rules → real app screenshots → features → outro with the GitHub link.

## Preview and render

```bash
npm install
npm run dev                      # Remotion Studio: preview and tweak every scene
npx remotion render SivaPromo out/siva-sentinel-linkedin.mp4 --codec=h264 --crf=18
```

## Voice

The question ("ryan" voice) and Siva's reply ("lessac" voice) are made with [Piper](https://github.com/rhasspy/piper),
a free, offline neural TTS, and are already in `public/voice/`.

To change what is said, edit `src/script.ts`, then run `pip install piper-tts` and `bash scripts/make-voice.sh`.
That regenerates both voices, evens out their loudness, and rewrites `src/voice-timing.json`, so the captions
and cards stay in sync and the scene length fits the new audio.
To use your own voice for the question, record it as `public/voice/user.wav` and run `node scripts/align-voice.mjs`.

## Where things are

| Path | What |
|---|---|
| `src/SivaPromo.tsx` | Main timeline: scene order, transitions, music, sound effects |
| `src/scenes/*.tsx` | One file per scene |
| `src/script.ts` | The spoken lines and their timing |
| `src/voice-timing.json` | When each word is spoken (made by `scripts/align-voice.mjs`) |
| `public/shots/` | Real screenshots of the app |
| `public/sfx/` | Music pad and sound effects (synthesised with ffmpeg) |
| `public/fonts/` | Inter and JetBrains Mono (SIL Open Font License) |
