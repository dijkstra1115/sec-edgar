// Assemble per-scene narration into one track, derive caption timing from the
// pauses in the audio, and synthesize a music/SFX bed.
// Usage: node scripts/build-audio.mjs
// Outputs: audio/narration.wav, audio/bed.wav, timing.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = JSON.parse(fs.readFileSync(path.join(root, "script.json"), "utf8"));
const SR = 24000;
const LEAD = 0.55; // silence before the first word
const GAP = 0.5; // pause between scenes
const TAIL = 2.6; // hold on the closing question

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12;
  let rate = 24000;
  while (p < b.length - 8) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") rate = b.readUInt32LE(p + 12);
    if (id === "data") {
      const n = Math.min(size, b.length - p - 8) >> 1;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
      if (rate !== SR) throw new Error(`${file}: expected ${SR} Hz, got ${rate}`);
      return out;
    }
    p += 8 + size + (size & 1);
  }
  throw new Error(`${file}: no data chunk`);
}

function writeWav(file, channels, rate) {
  const n = channels[0].length;
  const nc = channels.length;
  const b = Buffer.alloc(44 + n * nc * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * nc * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(nc, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * nc * 2, 28); b.writeUInt16LE(nc * 2, 32);
  b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * nc * 2, 40);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nc; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      b.writeInt16LE(Math.round(v * 32767), 44 + (i * nc + c) * 2);
    }
  fs.writeFileSync(file, b);
}

// 10 ms RMS envelope
const HOP = SR / 100;
function envelope(x) {
  const n = Math.floor(x.length / HOP);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < HOP; j++) s += x[i * HOP + j] ** 2;
    e[i] = Math.sqrt(s / HOP);
  }
  return e;
}

// How long a line takes to say, in rough syllable units.
function units(say) {
  const t = say.replace(/[A-Za-z]+/g, (w) => "x".repeat(Math.max(1, Math.round(w.length * 0.6))));
  let u = 0;
  for (const c of t) {
    if (/[\p{L}\p{N}]/u.test(c)) u += 1;
    else if (/[，、：]/.test(c)) u += 0.7;
    else if (/[。？！]/.test(c)) u += 1.4;
  }
  return u;
}

function alignScene(x, lines) {
  const e = envelope(x);
  const peak = e.reduce((a, b) => Math.max(a, b), 0);
  const thr = peak * 0.045;
  let a = 0;
  let z = e.length - 1;
  while (a < z && e[a] < thr) a++;
  while (z > a && e[z] < thr) z--;
  const t0 = Math.max(0, a / 100 - 0.05);
  const t1 = Math.min(x.length / SR, (z + 1) / 100 + 0.12);
  // pauses inside the speech
  const sil = [];
  let run = -1;
  for (let i = a; i <= z; i++) {
    if (e[i] < thr) { if (run < 0) run = i; }
    else if (run >= 0) { if (i - run >= 7) sil.push({ s: run / 100, e: i / 100 }); run = -1; }
  }
  const u = lines.map((l) => units(l.say));
  const total = u.reduce((p, c) => p + c, 0);
  const span = (z + 1 - a) / 100;
  const expect = [];
  let cum = 0;
  for (let k = 0; k < lines.length - 1; k++) { cum += u[k]; expect.push(a / 100 + (span * cum) / total); }
  // DP: assign each boundary to a pause (in order) or leave it unassigned.
  const B = expect.length;
  const S = sil.length;
  const SKIP = 0.6;
  const cost = (k, j) => {
    const mid = (sil[j].s + sil[j].e) / 2;
    return Math.abs(mid - expect[k]) - Math.min(0.5, sil[j].e - sil[j].s) * 0.6;
  };
  const dp = Array.from({ length: B + 1 }, () => new Float64Array(S + 1).fill(Infinity));
  const from = Array.from({ length: B + 1 }, () => new Int16Array(S + 1).fill(-2));
  dp[0].fill(0);
  for (let k = 1; k <= B; k++)
    for (let j = 0; j <= S; j++) {
      // boundary k-1 unassigned, pauses up to j available
      if (dp[k - 1][j] + SKIP < dp[k][j]) { dp[k][j] = dp[k - 1][j] + SKIP; from[k][j] = -1; }
      if (j > 0) {
        if (dp[k][j - 1] < dp[k][j]) { dp[k][j] = dp[k][j - 1]; from[k][j] = -3; }
        const c = dp[k - 1][j - 1] + cost(k - 1, j - 1);
        if (c < dp[k][j]) { dp[k][j] = c; from[k][j] = j - 1; }
      }
    }
  const pick = new Array(B).fill(null);
  let k = B;
  let j = S;
  while (k > 0) {
    const f = from[k][j];
    if (f === -3) j--;
    else if (f === -1) k--;
    else { pick[k - 1] = sil[f]; k--; j--; }
  }
  // Boundaries with no audible pause: place them by syllable count between the
  // nearest boundaries that did land on a pause (much tighter than scene-wide).
  for (let i = 0; i < B; i++) {
    if (pick[i]) continue;
    let p = i - 1;
    while (p >= 0 && !pick[p]) p--;
    let n = i + 1;
    while (n < B && !pick[n]) n++;
    const tA = p >= 0 ? pick[p].e : a / 100;
    const tB = n < B ? pick[n].s : (z + 1) / 100;
    const seg = u.slice(p + 1, n + 1);
    const before = u.slice(p + 1, i + 1).reduce((s, v) => s + v, 0);
    expect[i] = tA + ((tB - tA) * before) / seg.reduce((s, v) => s + v, 0);
  }
  const out = [];
  let start = a / 100;
  for (let i = 0; i < lines.length; i++) {
    const p = i < B ? pick[i] : null;
    const end = i < B ? (p ? p.s : expect[i]) : (z + 1) / 100;
    out.push({ start: start - t0, end: end - t0, snapped: i < B ? !!p : true });
    start = i < B ? (p ? p.e : expect[i]) : end;
  }
  return { t0, t1, lines: out };
}

// ---------- narration ----------
let cursor = LEAD;
const parts = [];
const scenes = [];
for (const sc of script.scenes) {
  const x = readWav(path.join(root, "audio", "raw", `${sc.id}.wav`));
  const al = alignScene(x, sc.lines);
  const seg = x.subarray(Math.round(al.t0 * SR), Math.round(al.t1 * SR));
  let pk = 0;
  for (const v of seg) pk = Math.max(pk, Math.abs(v));
  parts.push({ at: cursor, seg, gain: 0.82 / pk });
  scenes.push({
    id: sc.id,
    voiceStart: cursor,
    voiceEnd: cursor + seg.length / SR,
    lines: sc.lines.map((l, i) => ({
      cap: l.cap,
      start: +(cursor + al.lines[i].start).toFixed(3),
      end: +(cursor + al.lines[i].end).toFixed(3),
      snapped: al.lines[i].snapped,
    })),
  });
  cursor += seg.length / SR + GAP;
}
const total = +(cursor - GAP + TAIL).toFixed(2);
scenes.forEach((s, i) => {
  s.start = i === 0 ? 0 : +((scenes[i - 1].voiceEnd + s.voiceStart) / 2).toFixed(3);
  s.end = i === scenes.length - 1 ? total : +((s.voiceEnd + scenes[i + 1].voiceStart) / 2).toFixed(3);
  s.voiceStart = +s.voiceStart.toFixed(3);
  s.voiceEnd = +s.voiceEnd.toFixed(3);
});
const nar = new Float32Array(Math.ceil(total * SR));
for (const p of parts) {
  const o = Math.round(p.at * SR);
  const fade = SR * 0.01;
  for (let i = 0; i < p.seg.length; i++) {
    const f = Math.min(1, i / fade, (p.seg.length - i) / fade);
    nar[o + i] += p.seg[i] * p.gain * f;
  }
}
writeWav(path.join(root, "audio", "narration.wav"), [nar], SR);

// ---------- music + SFX bed (procedural, 48 kHz stereo) ----------
const R = 48000;
const N = Math.ceil(total * R);
const L = new Float32Array(N);
const Rr = new Float32Array(N);
let seed = 20261122;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const TAU = Math.PI * 2;
const add = (t, len, fn, pan = 0) => {
  const o = Math.round(t * R);
  const n = Math.round(len * R);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const k = o + i;
    if (k < 0 || k >= N) continue;
    const v = fn(i / R, i / n);
    L[k] += v * gl * 1.414;
    Rr[k] += v * gr * 1.414;
  }
};
// Drone: D minor pad with slow movement; swells toward the turn (s8) and the close.
const sStart = Object.fromEntries(scenes.map((s) => [s.id, s.start]));
const pad = [36.71, 73.42, 110.0, 146.83, 174.61, 220.0];
for (let i = 0; i < N; i++) {
  const t = i / R;
  const swell = 0.75 + 0.25 * Math.sin(TAU * t / 11) ;
  const tense = (t < sStart.s2) || (t > sStart.s4 && t < sStart.s7) || (t > sStart.s8 && t < sStart.s9) ? 1 : 0;
  let v = 0;
  let w = 0;
  for (let h = 0; h < pad.length; h++) {
    const f = pad[h] * (h === 4 && tense ? 0.9439 : 1); // F -> E: darker under the rebuttal
    const a = [0.55, 0.5, 0.3, 0.22, 0.16, 0.1][h] * (0.7 + 0.3 * Math.sin(TAU * t * (0.07 + h * 0.013) + h));
    v += a * Math.sin(TAU * f * t + 0.6 * Math.sin(TAU * 0.11 * t + h));
    w += a * Math.sin(TAU * f * 1.004 * t + 0.6 * Math.sin(TAU * 0.09 * t + h * 2));
  }
  const fadeIn = Math.min(1, t / 1.2);
  const fadeOut = Math.min(1, (total - t) / 1.8);
  const g = 0.085 * swell * fadeIn * fadeOut;
  L[i] += v * g;
  Rr[i] += w * g;
}
// Pulse: soft low thump every beat, light tick on the off-beat. 96 BPM.
const beat = 60 / 96;
for (let b = 0; b * beat < total - 2; b++) {
  const t = 1.0 + b * beat;
  const strong = b % 4 === 0;
  add(t, 0.32, (x) => (strong ? 0.2 : 0.11) * Math.sin(TAU * (48 + 34 * Math.exp(-x * 30)) * x) * Math.exp(-x * 13));
  add(t + beat / 2, 0.05, (x) => 0.022 * rnd() * 2 * Math.exp(-x * 90), b % 2 ? 0.4 : -0.4);
}
const whoosh = (t, len = 0.7, g = 0.11) => {
  let lp = 0;
  let bp = 0;
  add(t - len * 0.6, len, (x, p) => {
    const env = Math.sin(Math.PI * Math.min(1, p)) ** 2;
    const cut = 0.02 + 0.22 * Math.sin(Math.PI * p) ** 2;
    lp += cut * (rnd() * 2 - lp);
    bp += 0.5 * (lp - bp);
    return (lp - bp * 0.6) * env * g * 3;
  }, 0);
};
const impact = (t, g = 0.5) => {
  add(t, 1.1, (x) => g * Math.sin(TAU * (38 + 70 * Math.exp(-x * 18)) * x) * Math.exp(-x * 4.2));
  let lp = 0;
  add(t, 0.35, (x) => { lp += 0.25 * (rnd() * 2 - lp); return lp * g * 0.5 * Math.exp(-x * 16); });
};
const ding = (t, f = 1318.5, g = 0.05) =>
  add(t, 0.9, (x) => g * (Math.sin(TAU * f * x) + 0.4 * Math.sin(TAU * f * 2.01 * x)) * Math.exp(-x * 5), 0.2);
const riser = (t, len = 1.2, g = 0.07) =>
  add(t - len, len, (x, p) => g * p * p * Math.sin(TAU * (160 * x + 420 * x * x / len)) , 0);

const line = (sid, i) => scenes.find((s) => s.id === sid).lines[i].start;
scenes.slice(1).forEach((s) => whoosh(s.start));
ding(line("s1", 0) + 0.3, 1046.5); // 回來對答案
riser(line("s1", 2) + 0.4, 1.0);
impact(line("s1", 2) + 0.42, 0.55); // −14%
impact(line("s1", 3) + 0.2, 0.3); // 那斯達克
impact(line("s1", 3) + 1.6, 0.3); // 標普
riser(line("s1", 4) + 1.4, 1.2, 0.07);
impact(line("s1", 4) + 1.5, 0.5); // 倒著轉
[3, 4, 5].forEach((i) => ding(line("s2", i) + 1.0, [880, 987.8, 1108.7][i - 3], 0.045)); // three answers
ding(line("s3", 2) + 0.7, 1318.5); // 1/6
whoosh(line("s4", 0) + 0.7, 0.8, 0.13); // the loop reverses
impact(line("s4", 0) + 0.9, 0.42);
[0, 0.8, 1.4, 1.8].forEach((d) => impact(line("s4", 3) + 0.2 + d, 0.22)); // bars drop
riser(line("s4", 4) + 1.4, 1.1);
impact(line("s4", 4) + 1.42, 0.5); // −166 億
impact(line("s4", 5) + 1.3, 0.35); // 2%
impact(line("s4", 6) + 0.1, 0.3); // 減損
ding(line("s5", 1) + 0.4, 1046.5);
whoosh(line("s5", 2) + 0.3, 0.7, 0.1);
impact(line("s5", 3) + 0.9, 0.42); // 借
ding(line("s6", 1) + 0.9, 987.8); // 3,900 億
[0, 1, 2, 3].forEach((i) => ding(line("s6", 3) + 0.6 + i * 0.3, [880, 987.8, 1108.7, 1318.5][i], 0.035)); // suppliers
impact(line("s7", 0) - 0.02, 0.55); // the slap
ding(line("s7", 1) + 1.0, 987.8); // 775 億
for (let i = 0; i < 9; i++) ding(line("s7", 3) + 0.4 + i * 0.22, 1318.5, 0.018); // domes one by one
impact(line("s7", 3) + 3.0, 0.3); // one fails
impact(line("s7", 4) + 1.2, 0.45); // 嚴格評估 stamp
ding(line("s8", 3) + 0.1, 880);
ding(line("s9", 1) + 0.1, 987.8, 0.035);
ding(line("s9", 1) + 1.5, 1108.7, 0.035);
riser(line("s9", 3) + 0.2, 1.1, 0.06);
impact(line("s9", 3) + 0.3, 0.45);
let pk = 0;
for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]));
const norm = Math.min(1, 0.7 / pk);
for (let i = 0; i < N; i++) { L[i] *= norm; Rr[i] *= norm; }
writeWav(path.join(root, "audio", "bed.wav"), [L, Rr], R);

fs.writeFileSync(
  path.join(root, "timing.js"),
  `// Generated by scripts/build-audio.mjs — do not edit by hand.\nwindow.TIMING = ${JSON.stringify({ total, scenes }, null, 1)};\n`,
);
for (const s of scenes) {
  console.log(`${s.id} ${s.start.toFixed(2)}–${s.end.toFixed(2)}`);
  for (const l of s.lines) console.log(`   ${l.start.toFixed(2)}–${l.end.toFixed(2)} ${l.snapped ? " " : "~"} ${l.cap}`);
}
console.log(`total ${total}s`);

// keep the composition length in index.html in sync with the audio
const htmlPath = path.join(root, "index.html");
fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, "utf8").replace(/data-duration="[\d.]+"/g, `data-duration="${total}"`));
