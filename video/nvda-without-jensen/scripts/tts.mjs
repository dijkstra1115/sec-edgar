// Generate one narration WAV per scene with Gemini TTS.
// Usage: GEMINI_API_KEY=... node scripts/tts.mjs [sceneId ...] [--force]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY is not set");
const model = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
const script = JSON.parse(fs.readFileSync(path.join(root, "script.json"), "utf8"));
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
const outDir = path.join(root, "audio", "raw");
fs.mkdirSync(outDir, { recursive: true });

function prompt(text) {
  return [
    "# AUDIO PROFILE",
    script.style,
    "",
    "## DIRECTOR'S NOTES",
    "只唸出 TRANSCRIPT 的內容，不要唸出任何指示。語速快、節奏緊湊，像短影音旁白。英文專有名詞用英文原音唸。",
    "",
    "## TRANSCRIPT",
    text,
  ].join("\n");
}

async function synth(text) {
  const body = {
    contents: [{ parts: [{ text: prompt(text) }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: script.voice } } },
    },
  };
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    const d = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (d) return Buffer.from(d.data, "base64");
    console.warn(`  attempt ${attempt} failed: ${JSON.stringify(j.error ?? j).slice(0, 200)}`);
    await new Promise((res) => setTimeout(res, (j.error?.code === 429 ? 25000 : 5000) * attempt));
  }
  throw new Error("TTS failed after retries");
}

for (const scene of script.scenes) {
  if (only.length && !only.includes(scene.id)) continue;
  const out = path.join(outDir, `${scene.id}.wav`);
  if (fs.existsSync(out) && !force) { console.log(`${scene.id}: exists, skipping`); continue; }
  const text = scene.lines.map((l) => l.say).join("");
  console.log(`${scene.id}: ${text}`);
  // Guard against the model repeating itself or reading the directions aloud:
  // accept only takes whose pace is plausible for the text length.
  const units = [...text.replace(/[A-Za-z]+/g, (w) => "x".repeat(Math.max(1, Math.round(w.length * 0.6))))]
    .filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
  let wav, dur, rate;
  for (let take = 1; take <= Number(process.env.TAKES || 2); take++) {
    wav = await synth(text);
    dur = (wav.length - 44) / 48000;
    rate = units / dur;
    console.log(`  take ${take}: ${dur.toFixed(2)}s, ${rate.toFixed(2)} units/s`);
    if (rate >= 4.4 && rate <= 8) break;
  }
  fs.writeFileSync(out, wav);
  fs.writeFileSync(out + ".model.txt", model);
}
