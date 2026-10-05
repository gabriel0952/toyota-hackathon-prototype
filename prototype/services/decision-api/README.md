# Decision API v0.2

本機、單程序的 FastAPI + SQLite 決策核心。使用工程規則與種子資料；未接入 LLM、RAG、TDX、真實 LINE 或 CRM。

Phase 3 已加入獨立來源工具、官方知識檢索、候選規劃和模型輸出驗證模組，已接入 v0.3 API 與三端畫面。實作範圍、測試證據與外部整合待確認項目見 [Phase 3 進度](../../docs/phase-3-progress.md)；候選官方知識與審閱方式見 [knowledge](knowledge/README.md)。

## 安裝與啟動

在此目錄執行（已驗證 Python 3.9.6）：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
LOCAL_DEMO=1 .venv/bin/python -m uvicorn decision_api.app:app --host 127.0.0.1 --port 8000
```

`LOCAL_DEMO=1` 只用於本機展示顧問登入／reset；缺省關閉。不要以 `0.0.0.0` 啟動或對外部署此測試服務。`DECISION_DB` 可指定 SQLite 路徑，缺省 `decision.db`。資料庫、venv、測試 cache 均不入版控。允許的瀏覽器來源為 localhost/127.0.0.1:4173 與 127.0.0.1:4174；其他 Origin 拒絕修改。

啟動時以 `PRAGMA user_version` 執行 migration 至 schema v2；未知較新 schema 拒絕啟動。既有 v1 DB 首次升版前自動以 SQLite backup 保存 `<DB 路徑>-pre-v2.backup`（存在時不覆寫）。正式多節點部署、企業登入、營運監控與容量驗證不在本階段。

## 驗證

```sh
.venv/bin/python -m pytest -q
```

測試使用獨立暫存 DB；包括 four routes、unknown、零值、越界、重評失敗、並發 revision、idempotency、撤銷分享、服務重建與歷史重現。`decision_api/replay.py` 可用原始 rule/input/source snapshot 重算既有報告的決策內容。

OpenAPI：啟動後開啟 `http://127.0.0.1:8000/docs`。完整可重建的 request/response/error 範例見 `../../docs/examples-v0.2.json`。

## 備份、重設、回退

停服務後複製 `decision.db` 即可備份；若必須線上備份，使用 Python sqlite3 `Connection.backup()`，不要直接複製可能正在写入的 DB。還原時先停服務，再以備份取代 DB。全新測試請設定新的 `DECISION_DB` 路徑，保留舊檔供回復。

`POST /api/v1/demo/reset` 僅撤銷此瀏覽器登入 cookie，**不刪除任何人的報告**。fixture reset 則清除展示 provider 狀態。回退 UI：前端以 `VITE_DATA_PROVIDER=fixture` 重啟；API DB 不變，兩模式草稿與 context 隔離。

回退 Phase 2 後端時，先停服務，保留目前 schema v2 DB，再還原升版前 v1 備份與對應舊版程式；不要讓 v1 程式讀取 v2 DB，也不要以刪新表方式降版。備份後新增的報告不在舊備份裡。`Repository.backup(destination)` 提供線上 SQLite 備份。

報告只在取得／發布時使用短交易，外部計算在交易外。請求綁定 revision 與 30 秒 lease；同 key 進行中回 409 `run_in_progress` 與 Retry-After，前端保留 key 重試。過期 lease 可恢復，原執行不可發布。外部服務計費不保證 exactly-once；DB 原子提交避免同一 run 重複報告。

目前操作以 [Phase 3 runbook](../../docs/phase-3-runbook.md) 為準：自動讀取後端 .env、TDX 快取、零付費 Gemini 啟用條件與回退。預設 template。
