# 輝達的錢繞一圈：倒著轉 — 動畫影片

《輝達的錢繞一圈》的續集與「對答案」。同一個 3D 圓環，崩盤後倒著轉（1080×1920，Three.js 一鏡到底），Gemini TTS（Charon）配音、中文字幕、程序合成配樂。

- `script.json` 旁白與字幕；`SOURCES.md` 每個數字的出處（8-K、CFO Commentary、13F、法說會）
- `scripts/tts.mjs` 產生配音（`GEMINI_API_KEY` 走環境變數）；`scripts/build-audio.mjs` 組合旁白、推算字幕時間、合成配樂 → `timing.js`
- 還沒有配音時，`scripts/estimate-timing.mjs` 依字數估一份暫用的 `timing.js`，方便先做畫面
- `world.js` / `film.css` / `index.html` 3D 場景、鏡位與字幕
- 字型：`fonts/NotoSansTC.ttf`（未進版控，從上一集複製）
- 渲染：`npx hyperframes render --quality high -o renders/nvda-loop-reverse.mp4`（需要 Node 22）
