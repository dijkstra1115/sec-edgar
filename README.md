# SEC EDGAR 美股財報標準化資料集

從 SEC EDGAR 的免費 **XBRL `companyfacts` API** 抓取美股科技/半導體公司的 10-K（年報）與
10-Q（季報），用「華爾街分析師會看的欄位」做策展，輸出成乾淨、可擴充的標準化資料集。

目標：日後可直接餵給一個給台灣散戶看的美股 App —— 不必懂去 SEC 翻財報，也知道該看哪些數字。

## 涵蓋的公司（首批 8 檔）

| Ticker | 公司 | CIK | 財年結束 | 備註 |
|--------|------|-----|---------|------|
| NVDA | NVIDIA | 1045810 | 1月底 | |
| MU | Micron | 723125 | 8月底/9月初 | 記憶體 |
| SNDK | SanDisk | 2023554 | 6月底 | **2025/2 從 Western Digital 分拆**，獨立財報只到 2025 年起 |
| AVGO | Broadcom | 1730168 | 10月底/11月初 | |
| MRVL | Marvell | 1835632 | 1月底/2月初 | 財年結束會跨月漂移（52/53 週曆） |
| GOOGL | Alphabet | 1652044 | 12月底 | 不揭露 GrossProfit，毛利用 revenue−COGS 推算 |
| MSFT | Microsoft | 789019 | 6月底 | |
| META | Meta | 1326801 | 12月底 | |

## 怎麼跑

```bash
cd src
python build_dataset.py        # 一鍵：SEC 標準化 → 衍生指標 → 寬表/快照 → 估值倍數+分析師共識
python market_client.py        # （選用）重新抓最新股價/共識（行情會變，預設用快取）
```

第一次會打 SEC API 並把原始回應快取到 `data/raw/`（之後離線、瞬間完成）。
SEC 規則：需帶 User-Agent、每秒 ≤10 次 —— 已在 `sec_client.py` 內自我節流（見檔內 `USER_AGENT`，
fork 請改成你自己的聯絡 email）。

也可分階段跑：`python extract.py`（標準化）、`python derived.py`（衍生指標）。

## 產出檔案 `data/standardized/`

| 檔案 | 內容 |
|------|------|
| `facts_long.json` / `.csv` | **正本**。長表，每列一個（公司 × 財年 × 期別 × 欄位）的值 |
| `metrics_long.json` / `.csv` | 衍生指標（毛利率、ROIC、YoY 成長…），長表 |
| `wide_annual.csv` | 寬表：每列一個公司-財年，每個欄位一欄（人看用） |
| `wide_quarterly.csv` | 寬表：每列一個公司-季 |
| `snapshot_latest.csv` | 最新財年的核心計分卡（金額以百萬美元、比率以 %） |
| `coverage.csv` | 每個標準欄位在每家公司是否有抓到 tag（資料品質地圖） |
| `valuation_latest.json` / `.csv` | **估值倍數 + 分析師共識**（point-in-time，帶 `as_of` UTC 時戳） |

長表是正本（最好擴充、最適合進資料庫 / API）；寬表只是給人看。

## 估值層（SEC ＋ 行情）`valuation.py`

SEC 只有基本面、沒有股價。這一層把 SEC 基本面與市場行情接起來，**自己透明地算出倍數**
（而非直接抄 Yahoo 的黑盒比率；Yahoo 的版本以 `yf_*` 並列當對照，已驗證兩者一致）。

- **行情/共識來源**：`yfinance`（Yahoo，非官方）為主，`stooq`（免金鑰 CSV）為股價備援。
  原始回應快取在 `data/raw/market/<TICKER>.json`，帶 `as_of` 時戳（行情會變，需 `--refresh`）。
- **TTM（近四季）**：P/E、EV/EBITDA、P/S、FCF yield 都用「最近 4 季」滾動，且自動把未單獨申報的
  **Q4 用 全年−(Q1+Q2+Q3) 推算** —— 不是拿過時的去年年報。已驗證自算 P/E 與 Yahoo 逐檔吻合。
- **市值**用報價端市值（正確加總 GOOGL/META 多類股），EV = 市值＋總負債−現金−短投。
- **算出的倍數**：`pe_ttm`、`fwd_pe_consensus`、`ps_ttm`、`pb`、`ev_ebitda`、`ev_sales`、
  `fcf_yield_pct`、`earnings_yield_pct`、`dividend_yield_pct`。
- **分析師共識（投行視角的可取代理）**：`target_mean/high/low` 與隱含上檔 `target_upside_pct`、
  本/明年 forward EPS 共識與成長、買賣評等分布（strongBuy…strongSell）、涵蓋分析師家數。

> 共識 ≠ 個別投行報告。逐家投行的目標價/評等（如某大行 PT $X）在付費源（Refinitiv/IBES、
> FactSet、Bloomberg）。這裡給的是 ~40–60 位分析師（含主要投行）的**彙整共識**，是免費可取的最佳代理。
>
> 注意：快速飆漲後，分析師目標價常落後股價 —— 例如本批資料中 MU 共識目標 $703 低於現價 $971
> （隱含 −28%），評等卻仍 strong_buy。這是真實現象，不是 bug。

### 期別模型

- `period = annual`、`fiscal_period = FY` → 來自 10-K 的全年數
- `period = quarterly`、`fiscal_period = Q1/Q2/Q3` → 來自 10-Q 的「單季」（已排除 6個月/9個月的累計數）
- 財年（`fiscal_year`）以「財年結束所在的日曆年」標記（NVDA 2025/1 結束 = FY2025）。
  對財年結束會跨月漂移的公司（MRVL、AVGO…），用「最接近的財年結束日 + 容差」判定財年，
  季別用「距上一個財年結束的天數」推算，避免用日曆月份硬切而出錯。

## 欄位字典 `config/field_dictionary.json`

由「多位分析師視角」（損益表 / 資產負債表 / 現金流 / 分部與 KPI / 每股與估值 / 半導體品質）
協作策展而成，分兩類：

- **`fields`（58 個原始欄位）**：直接對應 XBRL tag。每個欄位列出多個候選 tag（依優先序），
  逐期取「最高優先且有值」的 tag —— 因為公司會跨年換 tag（例：NVDA 營收 FY2023 起從
  `RevenueFromContractWithCustomer…` 改成 `Revenues`；AVGO 淨利 FY2025 從 `NetIncomeLoss`
  改成 `ProfitLoss`）。`coverage.csv` 內以 `A+B` 標示某欄位是用多個 tag 拼接而成。
- **`derived_metrics`（25 個衍生指標）**：用公式（參照其他欄位 key）算出，例如
  `gross_margin = gross_profit / revenue`、`revenue_yoy_growth = (revenue − revenue_prior_year)/…`。
  缺輸入或除以零 → 記為 `null`（不亂編），缺口清楚可見。

每個欄位都標了 `priority`（core / important / optional），App 可預設只顯示 core。

### 要擴充時

- **加公司**：在 `config/companies.json` 加一列（ticker、CIK、財年結束 MM-DD），重跑即可。
  CIK 可在 https://www.sec.gov/files/company_tickers.json 查。
- **加欄位 / 指標**：在 `config/field_dictionary.json` 的 `fields` 或 `derived_metrics` 加項目
  （原始欄位給 XBRL tag 候選清單；衍生指標給公式），重跑即可，無需改程式。

## 已知限制（重要，給分析師看）

1. **分部 / 地區 / 產品別營收尚未抓**：字典裡 `dimensional: true` 的 5 個欄位
   （segment_revenue、geographic_revenue、product_service_revenue…）在 XBRL 裡是「維度資料」
   （掛在 segment/geography/product 軸上），不是單一 tag，需要另寫維度解析。這對 App 很有價值
   （NVDA Data Center 佔比、對中國/台灣的營收曝險），目前**標為缺、未抓取**。
2. **估值倍數**（股價、市值、EV、P/E、P/B、EV/EBITDA、殖利率）需市場行情，XBRL 沒有 ——
   已由估值層 `valuation.py` 接 yfinance/stooq 補上（見上節）。注意行情免費源（Yahoo 非官方）
   偶有缺漏或延遲，正式上線建議改用付費/官方行情 API。
3. **SNDK 歷史很短**：SanDisk 2025/2 才從 WDC 分拆，獨立財報只有幾季；3 年歷史與所有 YoY
   指標會稀疏或缺漏。分拆前數字需從 WDC 的 carve-out 揭露重建（不在 companyfacts 內）。
4. **多類股公司**：GOOGL、META 的流通股數（dei）依股別（A/B/C）以維度揭露，未加維度的
   封面股數可能低估總股數 —— 算市值時要留意。
5. **品質訊號 ≠ 錯誤**：例如 MRVL FY2026 淨利率(33%) > 營業利益率(16%)，是因為有約 17 億美元
   的業外利得，屬真實 GAAP 數字（也正是該標記的盈餘品質議題）。

## 目錄結構

```
sec-edgar/
  config/
    companies.json          # 目標公司（ticker / CIK / 財年結束 / 備註）
    field_dictionary.json   # 策展後的欄位字典（58 原始 + 25 衍生）
  src/
    sec_client.py           # 有節流 + 快取的 SEC API 客戶端
    extract.py              # XBRL → 標準化原始欄位（期別判定、tag 拼接）
    derived.py              # 衍生指標（安全公式求值、YoY、相依解析）
    market_client.py        # 行情 + 分析師共識（yfinance / stooq，帶時戳快取）
    valuation.py            # SEC 基本面 × 行情 → 估值倍數（TTM、透明自算）
    build_dataset.py        # 一鍵 orchestrator（4 階段）
  data/
    raw/                    # SEC 原始回應快取
    raw/market/             # 行情/共識快取（point-in-time）
    standardized/           # 產出資料集
```

資料來源：SEC EDGAR（公開領域）。本專案不含任何投資建議。
