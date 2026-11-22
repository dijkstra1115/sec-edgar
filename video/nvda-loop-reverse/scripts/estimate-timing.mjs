// Provisional timing.js from syllable counts, for building visuals before TTS exists.
// Usage: node scripts/estimate-timing.mjs   (build-audio.mjs overwrites it with real timing)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = JSON.parse(fs.readFileSync(path.join(root, "script.json"), "utf8"));
const RATE = 5.9, LEAD = 0.55, GAP = 0.5, TAIL = 2.6, LINE_GAP = 0.25;
const units = (say) => {
  const t = say.replace(/[A-Za-z]+/g, (w) => "x".repeat(Math.max(1, Math.round(w.length * 0.6))));
  let u = 0;
  for (const c of t) { if (/[\p{L}\p{N}]/u.test(c)) u += 1; else if (/[，、：；]/.test(c)) u += 0.7; else if (/[。？！]/.test(c)) u += 1.4; }
  return u;
};
let cur = LEAD;
const scenes = script.scenes.map((sc) => {
  const vs = cur;
  const lines = sc.lines.map((l) => { const d = units(l.say) / RATE; const o = { cap: l.cap, start: +cur.toFixed(3), end: +(cur + d).toFixed(3), snapped: false }; cur += d + LINE_GAP; return o; });
  const ve = cur - LINE_GAP; cur = ve + GAP;
  return { id: sc.id, voiceStart: +vs.toFixed(3), voiceEnd: +ve.toFixed(3), lines };
});
const total = +(cur - GAP + TAIL).toFixed(2);
scenes.forEach((s, i) => {
  s.start = i === 0 ? 0 : +((scenes[i - 1].voiceEnd + s.voiceStart) / 2).toFixed(3);
  s.end = i === scenes.length - 1 ? total : +((s.voiceEnd + scenes[i + 1].voiceStart) / 2).toFixed(3);
});
fs.writeFileSync(path.join(root, "timing.js"), `// PROVISIONAL (estimated) — run scripts/build-audio.mjs after TTS.\nwindow.TIMING = ${JSON.stringify({ total, scenes }, null, 1)};\n`);
const html = path.join(root, "index.html");
fs.writeFileSync(html, fs.readFileSync(html, "utf8").replace(/data-duration="[\d.]+"/g, `data-duration="${total}"`));
for (const s of scenes) console.log(s.id, s.start.toFixed(1), s.end.toFixed(1));
console.log("total", total);
