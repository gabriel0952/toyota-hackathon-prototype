# 外部整合核對紀錄

更新：2026-09-22。尚未執行授權 TDX 查詢或付費 Gemini 呼叫。

## Google Gemini

使用者已選擇 Google／`gemini-2.5-flash`。實作 `grounded/gemini.py`，採既有 httpx 呼叫官方 `generateContent` REST 協定，不增加 SDK 依賴。

- 官方依據：[模型能力](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash)、[REST API](https://ai.google.dev/api/generate-content)。
- API key 放後端 `GEMINI_API_KEY`，以 `x-goog-api-key` header 傳送，禁止放 URL。端點固定為 Google，拒絕重導向。
- Function declarations 使用 `parametersJsonSchema`，呼叫模式 `ANY`，`finish_report` 是受驗證的結束工具。最多 4 輪、8 次工具呼叫、20 秒總期限；預設總 token 上限 12000，每轮輸出最多 1024。這些預設仍待 G0 成本確認。
- 模型不取得整份問卷或內部 notes。controller 先完成必要證據與 deterministic evaluation；只有明確授權的資料投影進入模型。模型要求查詢範圍外參數會退回模板。
- `thinkingBudget=0`、`includeThoughts=false`。不保存 thoughts、prompt、模型全文或 thought signature；若協定需要 opaque signature，只在同次執行記憶體中傳回。
- 429／5xx 至多重試一次，計入總 deadline。格式錯誤、預算耗盡與生成故障退回相同決策的模板。

目前有模擬 HTTP 協定與 controller 測試，**尚未啟用到公開 API**。供應商 key 檔案位置、單次成本與本次測試總額待使用者提供，不能把測試中的 `synthetic` 模型當成真實驗收。

## TDX EV 官方文件

政府資料開放平台的[充電站基本資料](https://data.gov.tw/dataset/170220)與[充電槍基本資料](https://data.gov.tw/dataset/170222)指向 EV 文件群組：

- [Swagger](https://tdx.transportdata.tw/api-service/swagger/basic/b378d320-04a9-4fba-80b8-0df1b96dd5e8)
- [OpenAPI JSON](https://tdx.transportdata.tw/webapi/File/Swagger/V3/b378d320-04a9-4fba-80b8-0df1b96dd5e8)

已由官方頁面實際讀取並核對 OpenAPI，不能以原先 general Swagger 群組直接猜測端點。

| 項目 | 文件內容／狀態 |
|---|---|
| Auth | OAuth client credentials；`https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token` |
| Base | `https://tdx.transportdata.tw/api/basic` |
| 靜態 | `/v1/EV/Station/City/Taipei`、`Connector/City/Taipei`、`ServiceTime/City/Taipei` |
| 動態 | `/v1/EV/ConnectorLiveStatus/City/Taipei` |
| 分頁 | `$top`、`$skip`；`$format=JSON`。實際跨頁排序與完整性仍待查核。 |
| Wrapper | `Stations`、`Connectors`、`ServiceTimes`、`LiveStatuses`；文件宣告單個 wrapper object，實際形狀待驗證。 |
| 更新時間 | 保留 `SrcUpdateTime`；缺漏／無時區不改填查詢時間。 |
| 接頭 Type | 1 CCS1、2 官方文件文字為 `CCCS2`、3 CHAdeMO、4 Tesla TPC、5 J1772 Type1、6 Mennekes Type2、254 Others、255 Unknown。代碼 2 拼字與實際資料對照仍待核對，不以字串猜接頭。 |
| 電力 Power | 1 AC、2 DC；不能只看功率數字推測接頭。 |
| 使用狀態 | 1 閒置、2 佔用、3 故障；必須搭配 `LastUpdateTime` 與 freshness。 |
| 待解問題 | `Station` schema 未列出 StationID，但 Connector／LiveStatus 引用 StationID；ServiceTime schema 的站點關聯也不明確。需取真實回應核對，不自行造站槍 ID。 |

目前只有 raw spike `grounded/tdx.py`，沒有宣稱完成 normalize 或 CachedTdxProvider。已確認帳號憑證存在，尚未取得本機檔案路徑。缺憑證、未知 wrapper、來源故障會失敗，沒有 seed fallback；頁面中途失敗保留 partial。

設定好本機環境檔後，在後端目錄執行：

```sh
.venv/bin/python -m decision_api.tdx_probe --env-file .env --output .source-cache --dataset Station
```

依實際回應逐步擴充至其他 dataset。CLI 僅輸出查核摘要；原始快照留在 `.source-cache`（已忽略版控，檔案權限 0600）。本機保存不代表已核准公開散佈；取樣與授權保存條款仍需納入 G0 驗收。

## 2026-09-23 實證更新（取代前文待驗證狀態）

已完成授權實際請求與 Gemini Free tier 驗收；前文是實作前的文件核對紀錄。憑證位於後端本機 `.env`，不提交或輸出。

### 實際欄位與 normalize 決策

| 原始欄位 | 標準化／限制 |
|---|---|
| StationID、ConnectorID、ChargingPointID | 保留站／槍／充電樁識別；重複衝突不得充當獨立備援 |
| Location.Address.Town | 明確內湖區才列入；404 站缺此欄位，部分位於 Location.Place.POI |
| StationName 完整「臺北市內湖區」前綴 | 可辨識行政區的後備依據，留下 areaBasis；僅包含「內湖」不算。捷運內湖機廠的明確地址是南港區，因此排除 |
| Type + Power | Type 1 CCS1、2 CCS2、3 CHAdeMO、5 SAE J1772、6 TYPE_2；Power 1 AC、2 DC。衝突組合及未知值不算相容 |
| ServiceTimes | 全日型別與可完整覆蓋 08–18／18–翌日08 的時間窗才採用；只平日晚間不等於每天晚上 |
| PositionLat／PositionLon | 保留可用座標；目前不計算路線或繞行時間 |
| SrcUpdateTime／LastUpdateTime | 來源與單槍時間均保留，動態 5 分鐘後 unknown；取得時間不能代替來源更新 |
| RateDescription | 僅保留描述，不以文字猜測精確費率；成本仍是工程假設 |

完整分頁：443 站（5 頁）、1936 槍（2 頁）、443 時段（1 頁）、1632 動態（2 頁）。頁面大小預設 1000；中斷時保留 partial，429／5xx 有限重試。raw 快照、標準化快照及其引用存於忽略版控的 `.source-cache`／SQLite。

**試點 Go：限定行政區已辨識、接頭與時段可核對的候選報告。No-go：完整區域覆蓋、即時空位保證、沿途導航或正式營運。**

取樣：2026-09-23。`TPE1773` 臺北市內湖區新湖國民小學活動中心地下停車場，AC SAE J1772、全日 00:00–24:00，為技術核對候選；`TPE1108` 麗山國小含平日晚間限制，不當成全天可用。提案負責人於 2026-09-23 確認展示資料正確；現場空位與營運商限制未查驗。TDX 使用者憑證授權本機查詢與測試；本案不以取得憑證推論可任意公開再散布，正式再利用依 TDX 與原提供者條款由團隊確認。

Toyota 官方規配來源：[完整規配](https://www.toyota.com.tw/showroom/bZ4X/fullsepc.aspx)、[展示頁](https://www.toyota.com.tw/showroom/bZ4X/)。manifest 記錄公開引用、內容 hash、Codex 技術核對者與 30 天內部複核期限；不是官方簽章／法定有效期限。

Gemini 依官方 [function calling](https://ai.google.dev/gemini-api/docs/function-calling) 與 [pricing](https://ai.google.dev/gemini-api/docs/pricing)，使用者確認無付費帳務。費用上限皆 0、最多 4 輪／8 工具／12000 tokens／20 秒；每輪輸出最多 1024。只有公開且允許模型處理的官方 claim、來源 coverage/hash 與動作代碼傳給模型，不含問卷、精確位置或顧問筆記。實際 4 次生成、3165 tokens；摘要見 [live evidence](../phase-3-live-evidence.json)。免費額度失敗維持模板，不切換付費服務。

## 提案負責人人工檢核（2026-09-23）

提案負責人本人於本任務對話確認：「我本人今天已完成檢核 資料正確且僅限展示」。檢核範圍為台灣 bZ4X 202510 A 車規與 TPE1773 內湖試點候選；完整記錄見 [demo-human-review](../../services/decision-api/knowledge/demo-human-review.json)。真實 TDX 標準化快照 `source-425be2dca1d2940005c5d40731f2c55228fe5eda1d39c34d8b4cf055158e71cf`，取得於 2026-09-23T09:08:24.634232Z，原始快照保存在本機忽略版控區。此人工聲明沒有現場照片、營運商確認或外部授權文件，因此只核准本次展示資料與候選描述。
