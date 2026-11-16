# Voice examples

Four of the user's own posts, verbatim. These are the ground truth for the six-part structure
described in `voice.md` — read them when the abstract rules are not enough to settle a wording
choice. They are reproduced exactly as published; the annotations are separate, above each one.

Do not copy their sentences into new posts. Copy the *moves*: how a quote is set up, how a technical
mechanism gets translated, how the close turns on itself.

---

## 1. AVGO / MRVL — NVLink Fusion

**Job:** 敘事型. Explains a war in progress, so it drives shares. Villains, a conspiracy, a reversal.

**All six parts present. This is the reference implementation**, and the only one of the three with
a complete part 6. Note the structure of that close: it discloses a position, then attacks the bull
case it just spent 1,500 characters building, using TTM EPS, PE and gross margin. That reversal is
what separates this from a tip sheet.

**The move worth stealing:** the extended metaphor is *load-bearing*, not decoration. 靈魂綁架 and
肉體格式化 are not jokes; each one names a real mechanism (protocol compatibility, then physical
co-packaging) and the reader ends up understanding the mechanism because of the metaphor.

啃完 AVGO 與 MRVL 共 17,000 字的法會逐字稿後，資工宅用最白話解釋老黃的「NVLink Fusion 生態系」戰爭
💡 故事背景：大廠的叛亂（去輝達化）
微軟、Google、Meta 覺得輝達的 GPU 賣太貴了，想自己設計客製化晶片（XPU）來省錢。
這時，博通（Broadcom, AVGO）跳出來當地下總指揮。
博通在法說會上剛甩出單季 300 億美元的恐怖訂單，並挑明了聯手 OpenAI 和 Anthropic：「大廠們，你們自研晶片，網路交換機交給我，我們組一個『沒有 NVIDIA 的世界』！」
老黃看穿了這點。他知道大廠自研晶片是不可逆的，於是他使出了資工最經典的招式：「我打不過你的自研，那我就定義通訊協議（Protocol），直接在封裝內部截胡。」
這就是 NVLink Fusion 的連環套：
1️⃣ 靈魂綁架（相容 NVLink 協議）
老黃說：「你們想自己做晶片？可以。但晶片內部的通訊接口，必須相容我的 NVLink 6 協議。」 大廠為了追求極致的 Token 傳輸性能，妥協了。
2️⃣ 肉體格式化（拉攏兩大未上市矽光子獨角獸）
老黃大動作宣布加入 NVLink Fusion 的兩家獨角獸（Ayar Labs、Lightmatter），就是用來架空博通的祕密武器。它們做的事情，叫 CPO（共同封裝光學） 的底層革命：
• Ayar Labs（晶片自帶光學翅膀）： 傳統晶片用銅線傳輸（SerDes）。它直接用台積電 3D 異質封裝，把微型光學引擎（TeraPHY）黏在晶片外殼內。讓大廠的自研晶片一出廠，邊緣直接噴出光學訊號。
• Lightmatter（3D 光子主機板）： 晶片不用在平面排排坐了。大廠的晶片直接「3D 垂直堆疊」在 Lightmatter 的光子載板（Passage）上，訊號直接垂直打入載板的光學織網進行路由，頻寬密度暴增 8 倍。 
當大廠自研的晶片，裝上 Ayar 的接口、躺在 Lightmatter 的載板上時，神奇的事情發生了：這群原本為了「去輝達化」而生的晶片，在物理結構上，已經被無縫融合成了一台完全聽命於 NVIDIA 生態系的超級電腦。
博通原本想在外面賣乙太網交換機（Ethernet）拉攏大廠，結果老黃在「晶片包裝內部」就直接用光纖把網路線路給完全截胡了。
📊 那股價剛破 300 的 Marvell（MRVL）在幹嘛？
很多人問：既然獨角獸把光學載板和接口都做完了，那 Marvell 還有用嗎？
答案是：它正在雙頭抽稅。
光子獨角獸做的是「玻璃高速公路」（光學硬體），但計算機內部本質是電子世界。訊號進出光學公路時，需要經過極度高頻的調變、編碼與數位重整。
這就是 Marvell 的黃金主場——光學 DSP（數位訊號處理器）晶片。
老黃雖然強，但也無法違背物理定律。所以老黃第一時間把 Marvell 拉進 NVLink Fusion 同盟：
• 博通的乙太網陣營贏了，大廠買 Marvell 的 DSP。
• 輝達的 NVLink 宇宙贏了，大廠還是得買 Marvell 的 DSP。
這完美解釋了為什麼華爾街敢把 Marvell 明年的遠期 EPS 預估到 6.11 美元 的暴增水準，並給予它瘋狂的估值溢價。 
⚖️ 永遠警惕「確認偏誤」
這場商戰精彩絕倫，但回歸投資，我們一定要保持理性，拒絕只看自己想看的那一面。
我在一周前就已經提前布局了 Marvell（MRVL），跟著這波光速巨浪賺到了豐厚的波段；但看著現在的瘋狂情緒，我已經準備逐步入袋為安。
為什麼？因為我們必須翻開利潤表照妖鏡：
Marvell 現在股價強行突破 300 美元，拿過去四季實際賺進口袋的錢（TTM EPS 2.91）來算，目前的歷史本益比已經飆破 100 倍。即使說未來 12 個月完美暴發（Forward EPS 6.11），遠期本益比也逼近 50 倍。
別忘了，Marvell 的毛利率只有 58.9%。
它幫 Google、Meta 代工客製化 ASIC，本質上是個被客戶壓榨利潤的「高級打工仔」，它脆弱的財務結構根本不允許它長期享受 50 倍的遠期估值。
現在 300 美元的股價，是華爾街把 2027、2028 年能吹的矽光子牛皮，在今天一次性瘋狂折現的結果。 

---

## 2. MU — Memory-bound

**Job:** 準備型. A pre-earnings checklist, so it drives saves.

**Parts 1 to 5 present, part 6 missing.** No valuation reality-check, no position. This is the
gap the skill exists to close.

**The move worth stealing:** the opener denies the obvious expectation before stating the real
question — 「不是為了看營收或 EPS 有沒有超標，財報一出滿街都有。我真正想找的，是……」. That single
sentence is the strongest hook in the whole corpus and should be reused in every pre-earnings post.

**Also note:** the promise 「每一句都對得回逐字稿原文」 is made explicitly. Everything in
`factcheck.md` exists to keep that promise honest.

下週 MU 財報之前，我把美光過去兩季、約 15,000 字的法說會逐字稿從頭啃了一遍。
不是為了看營收或 EPS 有沒有超標，財報一出滿街都有。我真正想找的，是藏在管理層字句裡、決定長線估值的東西：巨頭現在最大的瓶頸，其實不是 GPU 算力，而是整個 AI 撞上了一道物理牆 → Memory-bound (記憶體頻寬與功耗瓶頸)。
以下 3 個重點，每一句都對得回逐字稿原文。建議收藏起來，等下週財報開出來，逐項對答案。
💡1. Agentic 時代：連 Vera Rubin 都被記憶體綁架
美光 CEO 點明：當 AI 轉向自主代理 (Agentic AI)與更長的深度推理鏈，架構就愈來愈吃記憶體。推理鏈越長、上下文越長，GPU 每吐一個詞就得不斷讀取持續變長的暫存記憶 (KV Cache) ; 大半時間不是在算，是在等記憶體。這就是 Memory-bound。
NVIDIA 下一代平台 Vera Rubin 的命脈就是 HBM，餵不夠快，GPU 再強也只能乾等挨餓。HBM4 由三家寡頭 (美光、三星、SK hynix) 供應，而美光第一時間就量產專為 Vera Rubin 設計的 HBM4 36GB 12-Hi，卡到關鍵身位。
賽道有多大？美光把 HBM TAM 從 2025 年 350 億美元，上修到 2028 年約 1,000 億美元(提前兩年、CAGR 約 40%)，並直言這個數字比 2024 年整個 DRAM 市場還大。這是結構性重定義，不是循環小漲跌。 
💡 2. 供給端的「永久性殘疾」
美光財務長親口吐實：製程推進變難，每片晶圓的位元成長率正在衰退 (declining bits-per-wafer)；想要更多產能，唯一解是 Greenfield → 重新蓋廠的物理限制，極度耗時。
更狠的是 HBM 對 DDR5 有 3:1 晶圓交換比，且每代越來越高：AI 一邊狂吃 HBM，一邊把一般 DRAM 供給抽乾。
所以美光把資本支出從 Q1 的 200 億、Q2 直接上修到 250 億美元以上，並強調營建支出成長率將超越設備支出。新廠晶圓產出要等 2027~2028 後，中短期缺貨無解。缺到什麼程度？美光自承：對關鍵大客戶，中期也只能滿足 50%~⅔ 的需求。 
💡 3. 推理時代的記憶體戰場，從「頻寬」轉向「容量」
進入 Agentic 推理時代，戰場多出一層 → 大容量記憶體。因為高並發、長上下文會產生龐大且不斷變長的 KV Cache，又快又貴的 SRAM 與 HBM 根本裝不下，必須有一層便宜的大容量記憶體來承接。
看 NVIDIA 最新的 Groq 3 LPX 推理機架就懂了：一個機架塞進 128GB 超高速 SRAM + 12TB DDR5，後者正是專門用來存放 KV Cache 的「大倉庫」。推理規模越大，這層容量需求越誇張。
美光要搶的就是這塊。它送樣的業界首款 256GB SOCAMM2 模組，把手機用的低功耗記憶體 (LPDRAM) 搬進數據中心，讓單一 CPU 容量衝到 2TB，功耗卻只有傳統伺服器 DDR 的 1/3 ; 同樣是海量容量，但更省電。
📊 下週財報，真正該對的答案
1. 資本支出結構：是買機器 (短期出貨利多)，還是繼續砸土建？若是後者，代表大廠能見度已看到 2028 後，缺貨比想像更嚴重。
2. LPDRAM 與企業級 SSD 佔比：別只盯 HBM。看 SOCAMM2 拉貨力道；閃迪企業級 SSD 上季暴增 233%，美光的 G9 PCIe Gen6 SSD 有沒有同級表現，是 NAND 部門看點。
3. 五年策略客戶協議(SCA)進展：看 QA 有沒有透露履約擔保數字。若客戶願意像閃迪一樣掏出超過 110 億美元擔保，美光的估值就該徹底脫離景氣循環股。

---

## 3. NVDA — 直播小抄

**Job:** 觀賽型. A live-watch cheat sheet, so it drives immediacy.

**Parts 1 to 5 present, part 6 missing**, same gap as post 2.

**The move worth stealing:** part 4 is a *keyword watchlist* — three specific phrases to listen for
on the call, each with a stated interpretation. That is the most actionable form the falsifiable
checklist can take, and it works because the reader can use it in real time rather than afterwards.

**Also note** the common-enemy device in the second line, and how the sign-off deliberately breaks
register (「接著奏樂，接著舞 🚀」) after 1,000 characters of dense technical argument. The tonal
release is what stops the post reading as a lecture.

明早清晨（5/21）輝達財報開獎，我直接去啃了老黃過去兩季共 15,000 字的「法會」逐字稿原文。
身為資工兼深度學習狗，用底層架構角度看完，我發現華爾街那群看 Excel 報表的人，明天可能又要被老黃割頭皮了。
觀看直播前，強烈建議帶著這 4 個「硬核內幕」當小抄：
1️⃣ 老黃早就不賣晶片了，他賣的是「整台巨型大腦」
分析師還在用「單顆晶片單價 x 產能」算營收。
但 Q4 逐字稿財務長自爆：GB200 水冷機櫃（整機出貨）已經佔了資料中心營收的 2/3！輝達早就從晶片商轉型成「超級電腦系統商」，裡面包了 NVLink 銅纜和一堆自研軟體，客單價極高，這才是毛利率逆天噴到 75.2% 的底層真相。
2️⃣ 會泡沫的是「GPT Wrappers」，真正落地的工作早就看 Token KPI 了
天天喊 AI 是泡沫的，那是指那些只會套個殼、Call 別人 API 就出來騙錢的 GPT Wrappers（包殼應用），那些沒護城河的確實會死成一片。但真正底層的 LLM 早就進場打工了，在實際工程工作上（寫 Code、重構、跑測試）幫爆軟體工程師。最硬核的是，輝達內部甚至把「Token 使用量」直接納入工程師的 KPI 考核；用得越多，代表你越懂得利用 AI 工具來壓榨出極致的生產力。
3️⃣ 下一個算力黑洞：大模型落地到現實世界的「Physical AI」
老黃的話術重心已經從單純的線上模型，移向「Agentic AI（自主代理）」和「Physical AI（物理與實體世界的 AI）」。光是 Physical AI 去年就幫他們賺了 60 億美元。當 AI 要驅動現實世界中的工廠、自動化運載與機器人時，必須在 Omniverse 平台裡跑極度恐怖的「物理世界模擬（Physics Simulation）」，那種運算壓榨才是真正的無底洞。
4️⃣ 明早清晨 5 點電話會議的「紅色警戒關鍵字」
如果問答階段老黃或財務長嘴裡吐出這三個詞，分析師就會亮紅燈，股價就要震盪，請做好避險準備：
⚠️ Digestion Phase（消化期）： 代表大客戶買完 Blackwell 發現軟體跟不上（KV Cache 太大把 SRAM 吸乾），要暫緩拉貨。
⚠️ Component cost / Advanced packaging pricing： 代表台積電或海力士的 HBM3e/HBM4 漲價，輝達被迫吞下成本。
⚠️ HBM4 Yield / Signal integrity issues： 代表 2026 年的下一代 Rubin 架構底層微架構卡關。
如果明早聽直播，老黃依然一臉自信狂噴 "Incredible demand"，那沒事了，大家接著奏樂，接著舞 🚀

---

## 4. NVDA — 沒有黃仁勳的輝達

**Published** 2026-11-16, the day before NVIDIA's Q3 FY2027 results and four days after Jensen
Huang resigned as CEO (Colette Kress interim). Drafted with this skill and then edited by the user;
the text below is the user's final version, not the draft.

**Job:** 敘事型, riding a news event. It turns "the CEO is gone" into a technical question — what
part of the moat does not depend on him — and answers it as an engineer.

**Parts 1 to 3 present, plus a self-rebuttal close.** No common enemy, no 📊 checklist, and the ⚖️
close attacks the thesis (AMD Helios, Anthropic's 2 GW MI450 deal) but carries no price, multiple or
position line. So part 6 is only half there by the `voice.md` definition.

**What the user cut from the draft** (useful signal, not yet a rule): the news lead with the
resignation details and the share price; the 白話 line closing part 2; the whole 📊 checklist; the
valuation and position lines. They also changed 「每天自己訓練、微調模型」 to
「每天工作都在訓練、微調模型」. The result is leaner and reads as an argument, not a trade setup.
In a post that rides a scandal, the user chose to keep the scandal and the price out of it entirely.

**The moves worth stealing:** the arithmetic opener for part 1 (1 TB of weights against 288 GB of
HBM, so the model must be split), which makes the reader derive the thesis themselves; the
meeting-table metaphor (email versus one table, with NCCL as the chair), which is load-bearing in
the same way 靈魂綁架 was in post 1; and the RCCL copyright line as a single verifiable detail that
proves "the code is not the moat."

**Two-part serial.** This is the second half of an argument that starts with "CUDA's moat is
narrowing because of AI." The ending 「明天開獎，我會回來對答案」 promises a follow-up, but there is no
stored checklist, so a `--review` would have to score the thesis itself: Vera Rubin's share of data
center revenue (guided at ~20%), networking growth against compute, and gross margin against the 74%
guide.

沒有黃仁勳的輝達，還剩下什麼⋯？
這幾天我把過去兩季、近 17,000 字的法說會逐字稿重新啃了一遍，就為了回答這個問題。
CUDA 絕對是多數人的第一直覺。但身為每天工作都在訓練、微調模型的資工宅，我認為 CUDA 的護城河正因 AI 而慢慢變窄⋯
AI 最會做的，就是寫出可以在一張卡上驗證對錯的程式。kernel 正好就是這種程式。
真正更強大的，是另一個很少人在講的東西：NVLink 與 NCCL 的生態系。
因為現在的大模型，光靠一顆 GPU 早已無法負荷。
1️⃣ 為什麼一顆 GPU 裝不下？
用最簡單的算術：一個上兆參數的模型，就算用 FP8 每個參數只存 1 byte，光權重就要約 1TB。
NVIDIA 官方規格寫的是 Vera Rubin 單顆 GPU 有 288GB HBM4。也就是說，至少要 4 顆才裝得下權重，這還沒算推理時不斷變長的 KV Cache。
所以模型只能切開，分散到很多顆 GPU 上。
問題來了：切開的模型每算一層，GPU 之間就要交換一次結果。生成一個字要跑過幾十層，等於幾十顆 GPU 每秒要開上萬次會。
這時候決定速度的，已經不是單顆 GPU 多會算，而是 GPU 之間「開會」有多快。
2️⃣ NVLink：讓 72 顆 GPU 坐在同一張會議桌
一般網路連起來的 GPU，像 72 個人用 email 開會；NVLink 則是讓 72 顆 GPU 坐在同一張桌子，直接看彼此的筆記。NVIDIA 把這個叫做 rack-scale（整櫃級）架構。
老黃在 Q2 法說會說，第一代 NVLink-72 推出時「it was a big surprise on the world」（讓全世界大吃一驚），而且「It was hardly easy」（一點都不容易）。
接著是我覺得最關鍵的一句：
「We had to reinvent the entire supply chain, reinvent systems, reinvent the technology, redistribute our software, refactor our software, everything, every aspect of it was hard.」（我們得重新發明整條供應鏈、系統和技術，重構軟體。每一個環節都很難。）
現在 NVIDIA 已經在做第三代 NVLink-72 整櫃系統。
3️⃣ NCCL：程式碼可以抄，經驗抄不走
如果 NVLink 是會議桌，NCCL 就是主持會議的人：決定資料走哪條路、誰先講、怎麼彙整。
有個很有趣的細節。AMD 的通訊函式庫 RCCL，原始碼版權聲明的第一行，寫的是 NVIDIA。
代表 NCCL 的程式碼本身不是秘密，連對手都拿去改。
真正抄不走的，是它和 NVLink 硬體在萬卡叢集上一起調了好幾年的實戰經驗。
資工宅的觀察：kernel 的 bug 可以在一張卡上重現，AI 可以反覆試到對為止；但通訊層的問題，常常只在幾千張卡一起跑了好幾天之後才冒出來。越難重現的問題，AI 越難幫你解。
4️⃣ 沒有黃仁勳，這些還在嗎？
我認為還在。NVLink、NCCL、整櫃系統，都已經寫進硬體、產品路線圖和簽好的供應合約裡。網路部門的底子，還來自 2020 年收購的 Mellanox。
數字也說明了一切：Q1 資料中心網路營收 150 億美元，年增將近 3 倍；Q2 網路營收再季增 18%。
老黃在 Q2 說：「the vast majority of the world’s data centers will just be Vera Rubin NVLink-72」（全世界絕大多數的資料中心，都會是 Vera Rubin NVLink-72）。
這句話要成真，靠的是工程團隊，不是一個人。
沒有黃仁勳，最容易少掉的是那些靠人脈談下來的主權 AI 與實驗室大單；最不容易少掉的，正是這座用銅纜和程式碼蓋起來的城牆。
⚖️ 說完 NVLink 有多強，我也得打自己的臉。
AMD 的 Helios 整櫃系統，同樣把 72 顆 GPU 綁成一個網域，用的是開放標準 UALink over Ethernet。Anthropic 7 月宣布最多導入 2 GW 的 AMD MI450，第一個 GW 預計 2027 上半年開始部署。AMD 還承諾最多投資 Anthropic 50 億美元，連老黃「入股換訂單」那招都學走了。
所以 NVLink 的護城河不是「只有它做得到」，而是「只有它已經量產到第三代」。這是時間上的領先，而時間領先終究會被追上。
沒有黃仁勳的輝達，剩下的是最硬的那一半。問題只剩一個：這道牆的領先，還有幾年？
明天（台灣 11/18 清晨）開獎，我會回來對答案。

---

## What the corpus says in aggregate

- **A complete part 6 appears once in four posts.** It is the highest-trust element and the main
  follower-to-customer converter, and it is the thing most likely to be dropped under time
  pressure. Enforce it. Post 4 kept the self-rebuttal but cut the price, multiple and position, and
  that was the user's own edit, not time pressure. So when the user trims part 6, ask whether it
  was intended rather than putting it back silently.
- **All four are timed to the days around an earnings call.** Timing supplies roughly half the
  distribution; a great post published a week late underperforms a good post published on the day.
- **None has a follow-up.** Every one sets up a checkable prediction and none of them ever came back
  to score it. That is why `--review` mode exists.
