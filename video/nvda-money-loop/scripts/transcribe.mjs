// Usage: GEMINI_API_KEY=... node scripts/transcribe.mjs file.wav
import fs from "node:fs";
const key = process.env.GEMINI_API_KEY;
const f = process.argv[2];
const body = {
  contents: [{ parts: [
    { inlineData: { mimeType: "audio/wav", data: fs.readFileSync(f).toString("base64") } },
    { text: "逐字聽寫這段音訊（繁體中文），每個短句一行，格式：[開始秒數-結束秒數] 文字。秒數精確到小數一位。只輸出聽寫結果。" },
  ] }],
};
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL||"gemini-3.8-flash"}:generateContent`, {
  method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const j = await r.json();
console.log(j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? JSON.stringify(j));
