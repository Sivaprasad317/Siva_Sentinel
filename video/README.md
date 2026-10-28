# Siva Sentinel: LinkedIn promo video

A 61-second, 1080×1350 (4:5, best for the LinkedIn feed) video made with [Remotion](https://remotion.dev).

Scenes: hook → intro → voice demo ("Hey Siva, what's today's updates?") → how it works →
ranking rules → real app screenshots → features → outro with the GitHub link.

## Preview and render

```bash
npm install
npm run dev                      # Remotion Studio: preview and tweak every scene
npx remotion render SivaPromo out/siva-sentinel-linkedin.mp4 --codec=h264 --crf=18
```

## Voice

The video renders without voice by default. To add the spoken demo:

- **Generate both voices** (free, offline Piper TTS): `pip install piper-tts`, then `bash scripts/make-voice.sh`.
- **Or record your own question**: save it as `public/voice/user.wav`, and put Siva's reply in `public/voice/siva.wav`.

When both files exist, the voices are switched on automatically and the music ducks under them.
The spoken text and its timing live in `src/script.ts`.

## Where things are

| Path | What |
|---|---|
| `src/SivaPromo.tsx` | Main timeline: scene order, transitions, music, sound effects |
| `src/scenes/*.tsx` | One file per scene |
| `src/script.ts` | The spoken lines and their timing |
| `public/shots/` | Real screenshots of the app |
| `public/sfx/` | Music pad and sound effects (synthesised with ffmpeg) |
| `public/fonts/` | Inter and JetBrains Mono (SIL Open Font License) |
