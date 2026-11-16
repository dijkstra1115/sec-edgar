# 沒有黃仁勳的輝達 — 動畫影片

Three.js 一鏡到底的 3D 版（1080×1920，約 1:46），搭配 Gemini TTS 配音與中文字幕。

- `script.json` 旁白與字幕；`scripts/tts.mjs` 產生配音（`GEMINI_API_KEY` 走環境變數）
- `scripts/build-audio.mjs` 組合旁白、推算字幕時間、合成配樂 → `timing.js`
- `world.js` / `film.css` / `index.html` 3D 場景、鏡位與字幕；`v1-2d/` 為舊的 2D 版
- 字型需自行放進 `fonts/`：Noto Sans TC、Noto Serif TC、Archivo、JetBrains Mono（Google Fonts）
- 渲染：`npx hyperframes render --quality high`
