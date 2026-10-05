# Phase 3 操作與維護

## 啟動

後端目錄 `prototype/services/decision-api`：將 `.env.example` 複製為本機 `.env`，填 TDX 憑證；不要提交。應用自動讀此檔，行程環境優先，內容不當作 shell 執行。指定 DB 路徑以後端工作目錄解析。

```sh
.venv/bin/python -m decision_api.refresh_sources --env-file .env --db decision.db
.venv/bin/python -m uvicorn decision_api.app:app --host 127.0.0.1 --port 8000
```

若 `.env` 的 DECISION_DB 不同，刷新命令需使用同一路徑。無 TDX 憑證但已有保存快照，可 `--import-directory .source-cache`；資料仍按原來源時間判定，不因重新匯入變新鮮。無試點快取時回傳來源失敗，不自動回 seed。非試點區域明確為未覆蓋。

在 `prototype` 執行 `pnpm dev:api`，開啟 `http://127.0.0.1:4174/driver`。舊 fixture 模式仍使用 `pnpm dev`／4173；兩者來源不可混稱。

## 零付費 Gemini

預設 `GENERATION_MODE=template`，沒有模型請求。有限次真實驗收須確認 key 所屬 Google AI Studio 專案 **Free tier、未啟用付費帳務**，設定 `GEMINI_FREE_TIER_CONFIRMED=1`、`GENERATION_MODE=llm`、兩個 USD cap 都是 0，供應商 google／模型 gemini-2.5-flash。任一條件不符則模板。這個旗標是操作者確認，不是 Google 帳務鎖；專案日後開啟付費時必須關閉模型模式。

僅公開允許的 claim／來源摘要與動作代碼外送，不傳車主問卷、精確位置、顧問筆記。最多 4 輪、8 工具、12000 tokens、20 秒；429／5xx 最多一次重試，失敗模板，沒有付費替代服務。讀報告不生成；新評估、模擬與更新才可能生成。驗收後恢復 template。

```sh
# 使用已確認的 Free tier；以行程設定限定本次啟動
GENERATION_MODE=llm GEMINI_FREE_TIER_CONFIRMED=1 .venv/bin/python -m uvicorn decision_api.app:app --host 127.0.0.1 --port 8000
```

## 展示步驟

1. 開始短問卷，既有車款保留 RAV4；評估目標由 API 明確指定台灣 bZ4X。
2. 停車選填設定家充已可用、住家台北市內湖區、白天，長途幾乎沒有。可產生主要條件通過報告；公共備援候選仍依當下來源、時段及接頭決定。
3. 展開來源看日期／partial／模板或 AI；充電策略可顯示新湖國小候選，不能說現在有空位。只有部分資料且不足兩個獨立公共站時，不強制公共黃燈。
4. 分享給本機示範顧問，從顧問及 LINE 示意畫面讀同一報告；LINE 尚非真實 Messaging API。
5. 模擬不改正式版；修改條件後產生新版，舊版保留。顧問筆記不出現在車主／LINE。撤銷後顧問下次讀取被拒絕。
6. 刷新來源不自動改使用者報告；使用者提交異動才重新評估。來源失敗保留舊版與待評估狀態。

## 資料庫與回退

schema v1→v2 自動建立 `<db>-pre-v2.backup`，保留 reports 原 payload；增加來源、快取、run／trace。未知較新 schema 拒絕。更新前停服務並以 SQLite backup API 額外備份；回退先停全部連線，保留現有 DB 供調查，再以備份恢復完整 DB（不混用舊 WAL／SHM）。具體原則與驗證見後端 README、migration 測試。只需停用模型時設 template；只需看歷史不必刷新來源。不要把 seed 模式當成來源故障降級。

## 驗證

後端 `.venv/bin/python -m pytest -q`；前端 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e`。

`pnpm exec playwright test --config playwright.grounded.config.ts` 驗證真實快取＋模板；確認 Free tier 並以 llm 啟動後加 `EXPECT_GENERATION_MODE=llm` 驗證。這不是預設自動 CI，避免意外外部請求。舊版 `test:e2e:api` 需獨立 seed DB 服務；測試不可使用正式使用者資料。
