# sec-edgar

一套給台灣散戶看美股的工具鏈。從 SEC EDGAR 與市場行情取得原始資料，經過分析師視角的策展，
最終產出可讀的內容。

不是三個獨立的專案，是**一條產線的三個階段**：

```
① 偵測  news_alert + insider_alert ──► Telegram          自動，每 10-20 分鐘
        「現在該注意誰」
              │
              ▼  scripts/post_context.py --scout
② 分析  earnings-post skill ─────────► Threads 貼文       隨選，深度
        「把訊號變成內容」
              ▲
              │  scripts/post_context.py TICKER
③ 基礎  XBRL 資料集 + 13F 機構流向 + 估值層
        「提供 ①② 都拿不到的專有佐證」
```

`scripts/post_context.py` 是三層之間唯一的接點。它把警報歷史、13F 機構流向、策展估值
彙整成一段可讀文字，交給內容流程。唯讀、純標準函式庫、不連網。

```bash
python scripts/post_context.py NVDA        # 某一檔的完整脈絡
python scripts/post_context.py --scout     # 接下來該寫誰
python scripts/post_context.py NVDA --json # 機器可讀
```

---

## ① 偵測層

兩個常駐輪詢，共用 `config/companies.json` 觀察清單與 `notifier.py`（Telegram）。
都由 Windows 工作排程器驅動，註冊腳本在 `scripts/`。

| | 來源 | 判斷方式 | 成本 | 說明 |
|---|---|---|---|---|
| **內部人警報** | SEC Form 4 | 規則式分類 | 零 token | 區分 10b5-1 排程賣出與自主賣出，只推後者。詳見 `docs/insider_alerts.md` |
| **新聞警報** | Benzinga + Finnhub + SEC 8-K | LLM 判官 | 約 $1/月 | 相關性、重大性、去重都需要語意判斷，故用 LLM。門檻與節奏在 `config/news_config.json` |

兩者的設計哲學不同：內部人是單一結構化來源，可用規則窮舉；新聞是多個非結構化來源，
必須有判官。這也是為什麼一個零成本、一個要花錢。

## ② 分析層

`.claude/skills/earnings-post/` —— 一個 Claude Code skill，從法說會逐字稿產出繁中 Threads 貼文。

核心主張是**翻譯而非資訊**：逐字稿公開且免費，稀缺的是把它讀懂並講成故事的能力。
所有事實都必須回溯到逐字稿原文或具名的市場資料來源。

四種模式：財報前小抄、財報後解讀、選題掃描、對答案續集。
完整流程、查證關卡、寫作規範見該目錄下的 `SKILL.md` 與 `references/`。

產出在 `drafts/`（未進版控）。累積的引言帳本在 `drafts/ledger/claims.jsonl`，
用途是跨公司三角驗證：三家互相競爭、沒有串供動機的公司在同一時期講同一件事，
是單一公司分析做不到的論證。

## ③ 基礎層

### XBRL 標準化資料集

從 SEC 免費的 **XBRL `companyfacts` API** 抓 10-K / 10-Q，用「分析師會看的欄位」策展，
輸出乾淨可擴充的長表。

涵蓋 20 檔科技 / 半導體 / 雲端股，清單見 `config/companies.json`。

**產出 `data/standardized/`**

| 檔案 | 內容 |
|------|------|
| `facts_long.json` / `.csv` | **正本**。長表，每列一個（公司 × 財年 × 期別 × 欄位）的值 |
| `metrics_long.json` / `.csv` | 衍生指標（毛利率、ROIC、YoY 成長…），長表 |
| `wide_annual.csv` | 寬表：每列一個公司-財年（人看用） |
| `wide_quarterly.csv` | 寬表：每列一個公司-季 |
| `snapshot_latest.csv` | 最新財年的核心計分卡 |
| `coverage.csv` | 每個標準欄位在每家公司是否抓到 tag（資料品質地圖） |
| `valuation_latest.json` / `.csv` | **估值倍數 + 分析師共識**，帶 `as_of` UTC 時戳 |
| `market_flows.csv` | 13F 機構持股的季度淨流向排行 |
| `institutional_holders.csv` | 13F 逐檔持有人 |

長表是正本（最適合進資料庫 / API）；寬表只是給人看。

### 估值層 `valuation.py`

SEC 只有基本面、沒有股價。這一層把兩者接起來，**自己透明地算出倍數**
（而非直接抄 Yahoo 的黑盒比率；Yahoo 版本以 `yf_*` 並列當對照，已驗證兩者一致）。

- **行情/共識**：`yfinance` 為主，`stooq` 為股價備援。快取在 `data/raw/market/`，帶 `as_of` 時戳。
- **TTM**：P/E、EV/EBITDA、P/S、FCF yield 都用最近 4 季滾動，且自動把未單獨申報的
  **Q4 用 全年−(Q1+Q2+Q3) 推算**，不是拿過時的去年年報。
- **市值**用報價端市值（正確加總 GOOGL/META 多類股），EV = 市值＋總負債−現金−短投。
- **分析師共識**：目標價與隱含上檔、本/明年 forward EPS 與成長、評等分布、涵蓋家數。

> 共識 ≠ 個別投行報告。這裡給的是數十位分析師的**彙整共識**，是免費可取的最佳代理。
> 注意快速飆漲後目標價常落後股價，隱含上檔為負但評等仍是 buy —— 這是真實現象，不是 bug。

### 期別模型

- `period = annual`、`fiscal_period = FY` → 10-K 全年數
- `period = quarterly`、`fiscal_period = Q1/Q2/Q3` → 10-Q 單季（已排除累計數）
- 財年以「財年結束所在的日曆年」標記（NVDA 2025/1 結束 = FY2025）。
  財年結束會漂移的公司（MRVL、AVGO、INTC…）用「最接近的財年結束日 + 容差」判定，
  季別用「距上一個財年結束的天數」推算，避免用日曆月份硬切。

### 欄位字典 `config/field_dictionary.json`

- **`fields`（58 個原始欄位）**：直接對應 XBRL tag，每欄列出多個候選 tag 依優先序取值 ——
  因為公司會跨年換 tag（NVDA 營收 FY2023 起換掉、AVGO 淨利 FY2025 從 `NetIncomeLoss`
  改成 `ProfitLoss`）。`coverage.csv` 以 `A+B` 標示某欄位是多 tag 拼接。
- **`derived_metrics`（25 個衍生指標）**：用公式參照其他欄位算出。缺輸入或除以零記為 `null`
  （不亂編），缺口清楚可見。

每個欄位標了 `priority`（core / important / optional）。

---

## 怎麼跑

```bash
# ③ 基礎層：重建資料集
cd src
python market_client.py        # 先刷新行情與共識
python build_dataset.py        # SEC 標準化 → 衍生指標 → 寬表 → 估值倍數

# ③ 13F 機構流向（每季更新一次）
python build_13f.py            # 需先把 SEC 的 13F bulk zip 放進 data/raw/13f/
python market_flows.py

# ① 偵測層：註冊排程（只需一次）
powershell -ExecutionPolicy Bypass -File scripts/register_alert_task.ps1
powershell -ExecutionPolicy Bypass -File scripts/register_news_task.ps1

# ② 分析層：在 Claude Code 裡
/earnings-post NVDA
```

第一次跑會打 SEC API 並快取到 `data/raw/`（之後離線、瞬間完成）。
SEC 規則需帶 User-Agent、每秒 ≤10 次，已在 `sec_client.py` 內自我節流 ——
fork 請改成你自己的聯絡 email。

## 要擴充時

- **加公司**：在 `config/companies.json` 加一列（ticker、CIK、財年結束 MM-DD），重跑即可。
  CIK 可在 https://www.sec.gov/files/company_tickers.json 查。
  外國發行人請加 `"xbrl_taxonomy": "ifrs-full"`（見下方限制 1）。
- **加欄位 / 指標**：在 `config/field_dictionary.json` 加項目，重跑即可，無需改程式。

## 已知限制

1. **外國發行人抓不到基本面**。NOK（芬蘭）與 TSM（台灣）申報 20-F 而非 10-K/10-Q，
   且用 IFRS 分類：companyfacts 裡只有 `ifrs-full` 標籤、**零個 us-gaap**，而欄位字典是
   us-gaap 建的。`extract.py` 會依 `xbrl_taxonomy` 旗標明確跳過並印出原因，不會產生
   全空的假資料列。這兩檔仍留在觀察清單上供新聞警報使用，估值層也還能從行情端算出
   forward P/E 與目標價。**它們的財務數字必須從法說會逐字稿取得。**
   台積電另有一點：外國發行人豁免 Section 16，**沒有 Form 4**，內部人警報永遠不會對它作動。
2. **分部 / 地區 / 產品別營收尚未抓**：字典裡 `dimensional: true` 的 5 個欄位在 XBRL 裡是
   維度資料，掛在 segment/geography/product 軸上，不是單一 tag，需要另寫維度解析。
   這對內容很有價值（NVDA 資料中心佔比、對中國營收曝險），目前標為缺、未抓取。
3. **行情來源是免費非官方源**（Yahoo），偶有缺漏或延遲。正式上線建議改用付費行情 API。
4. **分拆公司歷史很短**：SNDK 2025/2 才從 WDC 分拆、CEG 2022 從 Exelon 分拆、CRWV 2025 才 IPO，
   3 年歷史與所有 YoY 指標會稀疏。分拆前數字需從母公司 carve-out 揭露重建，不在 companyfacts 內。
5. **多類股公司**：GOOGL、META 的流通股數依股別以維度揭露，未加維度的封面股數可能低估總股數。
6. **品質訊號 ≠ 錯誤**：例如淨利率 > 營業利益率通常是業外利得所致，是真實 GAAP 數字，
   也正是該被標記的盈餘品質議題。

## 目錄結構

```
sec-edgar/
  config/
    companies.json          # 觀察清單，三層共用
    field_dictionary.json   # 策展欄位字典（58 原始 + 25 衍生）
    news_config.json        # 新聞警報門檻與節奏
    alert_config.json       # 內部人警報設定
  src/
    sec_client.py           # 有節流 + 快取的 SEC API 客戶端
    extract.py              # XBRL → 標準化原始欄位
    derived.py              # 衍生指標
    market_client.py        # 行情 + 分析師共識
    valuation.py            # 基本面 × 行情 → 估值倍數
    build_dataset.py        # ③ 一鍵 orchestrator
    read_13f.py             # 13F 解析
    build_13f.py            # 13F 建表（含基金家族彙整）
    market_flows.py         # 13F 季度淨流向
    read_form4.py           # Form 4 解析
    insider_alert.py        # ① 內部人警報
    news_sources.py         # ① 新聞來源
    news_judge.py           # ① LLM 判官
    news_alert.py           # ① 新聞警報
    notifier.py             # Telegram 推播（① 共用）
  scripts/
    post_context.py         # ①③ → ② 的接點
    insider_latest.py       # 逐檔最近一次公開市場賣出
    register_*_task.ps1     # 工作排程註冊
  .claude/skills/
    earnings-post/          # ② 內容流程
  data/
    raw/                    # SEC 與行情原始快取
    standardized/           # ③ 產出資料集
    alerts/ news/           # ① 執行狀態與日誌
  drafts/                   # ② 產出貼文與引言帳本（未進版控）
```

資料來源：SEC EDGAR（公開領域）。本專案不含任何投資建議。
