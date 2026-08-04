# 內部人文件即時快報（insider_alert）

觀察清單裡的公司一有**新的 SEC 內部人文件（Form 4）**，就第一時間把「高訊號」的那幾筆推到你手機。

**設計原則：執行階段 0 token、0 API 費用。** 整條管線是純 Python —— HTTP GET SEC → XML 解析 → 規則分級 → 一個 HTTP POST 到 Telegram。**迴圈裡沒有任何 LLM。** SEC 與 Telegram 都免費。唯一花 token 的地方是「當初請 Claude 幫你蓋它」。

---

## 這套系統怎麼運作

```
Windows 排程器每 5 分鐘（腳本在非美東收件時段會毫秒級跳過）
  └─ src/insider_alert.py
       ├─ 讀 config/companies.json 的 CIK（觀察清單）
       ├─ 逐檔抓 data.sec.gov submissions（每次抓最新、不吃快取）
       ├─ 比對 data/alerts/state.json（已看過的 accession）找出新件
       ├─ 新的 Form 4 → 解析 XML → 分級（見下）
       └─ 只推 config 指定的等級 → Telegram
```

**首次執行會「靜默播種」**：把現有申報全記進 state、**不發任何通知**，避免被歷史文件洗版。之後才會對「真正新出現」的文件發報。

## 分級規則（純規則、可調，改 `config/alert_config.json` 即可，不用動程式）

| 等級 | 條件 | 預設是否推播 |
|------|------|:---:|
| 🔴 HIGH | **任何公開市場買進（code P）** | ✅ |
| 🔴 HIGH | **非計畫性賣出** 且金額 ≥ `discretionary_sale_usd`（預設 $5M） | ✅ |
| 🔴 HIGH | **10b5-1 計畫賣出** 且金額 ≥ `plan_sale_usd`（預設 $50M） | ✅ |
| 🟡 MEDIUM | 一般賣出（未達上述門檻） | ❌ |
| ⚪ LOW | 授予 / 選擇權行使 / 扣稅 / 贈與 | ❌ |

**為什麼把 10b5-1 分開？** 10b5-1 是幾個月前就排定的自動賣出計畫，與「當下的消息」無關 → 低訊號。臨時起意的非計畫性賣出、以及內部人自掏腰包買進，才反映當下判斷 → 高訊號。這是把雜訊砍掉 2/3 的關鍵（實測某 45 天窗口：52 筆 → 17 筆）。

> ⚠️ Form 4 的「本次申報後仍持有 N 股」是**單筆申報**的餘額，**不是總持股**。一批 vested 股票賣光會顯示「剩 0 股」，但本人其他帳戶可能還有數百萬股。所以本系統**只用絕對金額**分級，不用「佔持股％」（那個數字會嚴重誤導）。

---

## 上線三步驟

### 1. 建 Telegram Bot（一次性，約 2 分鐘）

1. Telegram 裡搜尋 **@BotFather** → `/newbot` → 取得 **bot token**（形如 `123456789:ABC...`）。
2. 打開你剛建的 bot，隨便傳一句話給它（例如 `hi`）。
3. 拿到你的 **chat_id**：
   ```powershell
   $env:TELEGRAM_BOT_TOKEN = "貼上你的 token"
   python src\insider_alert.py --get-chat-id
   ```
4. 把兩個值填進設定檔：複製 `config/secrets.example.json` 成 **`config/secrets.local.json`**，填入 `bot_token` 與 `chat_id`。（或改用環境變數 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`，環境變數優先。）
5. 測試通道：
   ```powershell
   python src\insider_alert.py --test
   ```
   手機收到「測試訊息，通道正常」就代表通了。

### 2. 靜默播種 + 排程常駐

```powershell
python src\insider_alert.py --seed                       # 記錄現有文件、不發通知
powershell -ExecutionPolicy Bypass -File scripts\register_alert_task.ps1
```
排程器會每 5 分鐘跑一次（腳本自己會在非美東收件時段毫秒級跳過，所以 24/7 幾乎零成本）。手動測跑一次：
```powershell
Start-ScheduledTask -TaskName "SEC Insider Alert"
```
移除排程：
```powershell
Unregister-ScheduledTask -TaskName "SEC Insider Alert" -Confirm:$false
```

### 3. 完成
之後觀察清單公司一有符合條件的新 Form 4，你就會在手機上收到，例如：

> 🔴 **NVDA** 內部人賣出
> STEVENS MARK A · Director
> 賣出 1,000,000 股 @ $221.10 ＝ **$221.10M**
> 交易日 2026-06-04 · 申報 2026-06-04
> 10b5-1 計畫：否/未註明
> ⚠️ 非計畫性賣出（自主決定，訊號較強）
> 🔗 SEC 原文

---

## 常用指令

| 指令 | 用途 |
|------|------|
| `python src\insider_alert.py` | 跑一輪（排程器就是跑這個） |
| `python src\insider_alert.py --dry-run --days 45` | 把最近 45 天符合條件的文件**印出來**（不發、不動 state）——調門檻時用這個看效果 |
| `python src\insider_alert.py --seed` | 重新播種（例如你在 config 加了 Form 3/5 之後） |
| `python src\insider_alert.py --test` | 送一則測試訊息 |
| `python src\insider_alert.py --force` | 忽略美東收件時段限制，強制跑一輪 |

## 調校備忘

- **想要更少通知**：把 `discretionary_sale_usd` / `plan_sale_usd` 調高。
- **想連一般賣出也收**：把 `push_tiers` 加上 `"MEDIUM"`。
- **想追蹤新內部人出現（Form 3）或年度補報（Form 5）**：`forms_tracked` 加 `"3"` / `"5"`，然後**務必重新 `--seed`**（否則會把一堆歷史 3/5 當成新件洗版）。
- **延遲說明**：Form 4 是「交易後 2 個工作日內」申報，所以你收到的是**公開揭露的第一時間**，不是交易當下 —— 這是 SEC 揭露延遲的天花板。EDGAR 只在美東 6am–10pm 收件，換算台灣約傍晚到隔天早上。

## 檔案清單

| 檔案 | 角色 |
|------|------|
| `src/insider_alert.py` | 主程式：輪詢 / 解析 / 分級 / 去重 / 播種 |
| `src/notifier.py` | 可插拔通知出口（Telegram / Console；要加 Email/Discord 就在這裡加一個類別） |
| `config/alert_config.json` | 門檻、推播等級、收件時段（改這裡不用動程式） |
| `config/secrets.example.json` | Telegram 憑證範本（複製成 `secrets.local.json` 填寫，勿外流） |
| `scripts/register_alert_task.ps1` | 一鍵註冊 Windows 排程 |
| `data/alerts/state.json` | 已看過的申報（去重狀態，自動產生） |
| `data/alerts/alerts.log` | 推播與錯誤紀錄（即使漏看 Telegram 也查得到） |
