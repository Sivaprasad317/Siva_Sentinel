// Works out when each word of Siva's reply is spoken, for the karaoke captions.
// Finds the pauses in public/voice/siva.wav (ffmpeg silencedetect), matches each pause to the
// nearest punctuation mark in the text, then spreads the words inside each spoken stretch by length.
// Writes src/voice-timing.json. Run after generating or recording new voice files.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("src/script.ts", "utf8");
const line = (k) => src.match(new RegExp(`${k} =\\s*"([^"]+)"`))[1];
const duration = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const userDur = duration("public/voice/user.wav");
const sivaDur = duration("public/voice/siva.wav");
// ffmpeg prints silencedetect results on stderr.
const out = execFileSync("sh", ["-c", "ffmpeg -i public/voice/siva.wav -af silencedetect=n=-40dB:d=0.2 -f null - 2>&1"]).toString();
const starts = [...out.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
const ends = [...out.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
// Spoken stretches between silences.
let segs = [];
let t = 0;
starts.forEach((s, i) => {
  if (s > t + 0.05) segs.push([t, s]);
  t = ends[i] ?? sivaDur;
});
if (t < sivaDur - 0.05) segs.push([t, sivaDur]);
if (segs[0] && segs[0][0] < 0.05) segs[0][0] = 0;

const words = line("SIVA_LINE").split(" ");
const chars = words.map((w) => w.length + 1);
const totalChars = chars.reduce((a, b) => a + b, 0);
const speech = segs.reduce((a, [s, e]) => a + (e - s), 0);
// Expected speaking time at the end of each word if speech were uniform.
let acc = 0;
const expectedEnd = chars.map((c) => (acc += (c / totalChars) * speech));
// Map each pause (except after the last stretch) to the punctuation boundary closest in expected time.
const breaks = [];
let spoken = 0;
for (let i = 0; i < segs.length - 1; i++) {
  spoken += segs[i][1] - segs[i][0];
  let best = -1;
  words.forEach((w, j) => {
    if (!/[,.!?]$/.test(w) || j <= (breaks.at(-1) ?? -1) || j === words.length - 1) return;
    if (best < 0 || Math.abs(expectedEnd[j] - spoken) < Math.abs(expectedEnd[best] - spoken)) best = j;
  });
  breaks.push(best);
}
// Assign word start times inside each stretch.
const timing = [];
let w0 = 0;
segs.forEach(([s, e], i) => {
  const w1 = i < breaks.length ? breaks[i] + 1 : words.length;
  const group = words.slice(w0, w1);
  const gChars = group.reduce((a, w) => a + w.length + 1, 0);
  let c = 0;
  group.forEach((w) => {
    timing.push({ word: w, start: +(s + (c / gChars) * (e - s)).toFixed(3) });
    c += w.length + 1;
  });
  w0 = w1;
});

writeFileSync("src/voice-timing.json", JSON.stringify({ userDuration: +userDur.toFixed(3), sivaDuration: +sivaDur.toFixed(3), words: timing }, null, 2) + "\n");
console.log(`user ${userDur.toFixed(2)}s, siva ${sivaDur.toFixed(2)}s, ${segs.length} spoken stretches, ${timing.length} words`);
