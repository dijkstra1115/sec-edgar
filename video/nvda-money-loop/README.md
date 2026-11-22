# 輝達的錢繞一圈 — 動畫影片

Three.js 一鏡到底的 3D 版（1080×1920，約 1:56），延續《沒有黃仁勳的輝達》的做法：Gemini TTS（Charon）配音、中文字幕、程序合成配樂。

- `script.json` 旁白與字幕；`SOURCES.md` 每個數字的 10-Q 出處
- `scripts/tts.mjs` 產生配音（`GEMINI_API_KEY` 走環境變數）；`scripts/build-audio.mjs` 組合旁白、推算字幕時間、合成配樂 → `timing.js`
- `world.js` / `film.css` / `index.html` 3D 場景、鏡位與字幕
- 字型：`fonts/NotoSansTC.ttf`（Noto Sans TC 可變字型，未進版控）；數字用 HyperFrames 內建的 Archivo Black，標籤用 JetBrains Mono
- 渲染：`npx hyperframes render --quality high -o renders/nvda-money-loop.mp4`（需要 Node 22）
