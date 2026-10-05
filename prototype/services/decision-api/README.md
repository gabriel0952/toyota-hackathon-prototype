# Decision API

轉電路徑顧問的後端：本機、單程序的 FastAPI + SQLite 服務。接收車主問卷，以規則引擎判定燈號與成本，產生不可變的報告版本，並依角色（車主／LINE／顧問）輸出不同投影。

## 兩種資料來源

| 模式 | 啟用方式 | health 回傳 | 說明 |
| --- | --- | --- | --- |
| 內建規則 | 預設（無 `.env` 或未設 `DECISION_SOURCE_MODE`） | `contractVersion: "0.2"` | 工程種子車規、站點與費率，不需任何金鑰 |
| 真實來源 | `.env` 設 `DECISION_SOURCE_MODE=tdx_cache` | `contractVersion: "0.3"` | TDX 充電站快取 + TOYOTA bZ4X 官方車規；可選用 Gemini 整理說明 |

真實來源模式的設定、快取刷新與 Gemini 啟用條件見 [Phase 3 操作手冊](../../docs/phase-3-runbook.md)；驗收結果與限制見 [Phase 3 驗收](../../docs/phase-3-progress.md)；官方車規資料與審閱方式見 [knowledge](knowledge/README.md)。

## 安裝與啟動

最簡單的方式是在 `prototype/` 執行 `pnpm dev:full`，會一併建立 venv 並啟動前後端。單獨啟動後端時，在此目錄執行（已驗證 Python 3.9.6）：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
LOCAL_DEMO=1 .venv/bin/python -m uvicorn decision_api.app:app --host 127.0.0.1 --port 8000
```

啟動後開啟 <http://127.0.0.1:8000/docs> 查看 OpenAPI。

## 程式結構

| 路徑 | 內容 |
| --- | --- |
| `decision_api/app.py` | API 路由、身分 cookie、分享權限與報告發布 |
| `decision_api/engine.py`、`rulebook.json` | 內建規則模式的評估與決策門檻 |
| `decision_api/engines/` | 依版本固定的引擎：v04 為真實來源模式目前使用的版本，v02／v03 保留供舊報告依原規則重算 |
| `decision_api/grounded/` | 真實來源模式：TDX 快取、官方車規、候選規劃、Gemini 工具呼叫與輸出驗證 |
| `decision_api/repository.py`、`runs.py` | SQLite schema、migration、交易與執行 lease |
| `decision_api/replay.py` | 以原始規則、輸入與來源快照重算既有報告 |
| `decision_api/refresh_sources.py` | 刷新或匯入 TDX 來源快取 |
| `knowledge/` | TOYOTA bZ4X 官方車規與人工審閱紀錄 |
| `tests/` | pytest：規則、來源狀態、權限、版本、模型降級與重播 |

## 執行設定

後端會自動讀取此目錄的 `.env`（可參考 `.env.example`），行程環境變數優先。`LOCAL_DEMO=1` 只用於本機展示顧問登入／reset；缺省關閉。不要以 `0.0.0.0` 啟動或對外部署此測試服務。`DECISION_DB` 可指定 SQLite 路徑，缺省 `decision.db`。資料庫、venv、測試 cache 均不入版控。允許的瀏覽器來源為 localhost/127.0.0.1:4173 與 127.0.0.1:4174；其他 Origin 拒絕修改。

啟動時以 `PRAGMA user_version` 執行 migration 至 schema v2；未知較新 schema 拒絕啟動。既有 v1 DB 首次升版前自動以 SQLite backup 保存 `<DB 路徑>-pre-v2.backup`（存在時不覆寫）。正式多節點部署、企業登入、營運監控與容量驗證不在本階段。

## 驗證

```sh
.venv/bin/python -m pytest -q     # 或在 prototype/ 執行 pnpm test:api
```

測試使用獨立暫存 DB，不呼叫外部服務；包括 four routes、unknown、零值、越界、重評失敗、並發 revision、idempotency、撤銷分享、服務重建與歷史重現。`decision_api/replay.py` 可用原始 rule/input/source snapshot 重算既有報告的決策內容。

完整可重建的 request/response/error 範例見 [examples-v0.2.json](../../docs/examples-v0.2.json) 與 [examples-v0.3.json](../../docs/examples-v0.3.json)。

## 維運細節：備份、重設、回退

停服務後複製 `decision.db` 即可備份；若必須線上備份，使用 Python sqlite3 `Connection.backup()`，不要直接複製可能正在写入的 DB。還原時先停服務，再以備份取代 DB。全新測試請設定新的 `DECISION_DB` 路徑，保留舊檔供回復。

`POST /api/v1/demo/reset` 僅撤銷此瀏覽器登入 cookie，**不刪除任何人的報告**。fixture reset 則清除展示 provider 狀態。回退 UI：前端以 `VITE_DATA_PROVIDER=fixture` 重啟；API DB 不變，兩模式草稿與 context 隔離。

回退 Phase 2 後端時，先停服務，保留目前 schema v2 DB，再還原升版前 v1 備份與對應舊版程式；不要讓 v1 程式讀取 v2 DB，也不要以刪新表方式降版。備份後新增的報告不在舊備份裡。`Repository.backup(destination)` 提供線上 SQLite 備份。

### 交易與並發

報告只在取得／發布時使用短交易，外部計算在交易外。請求綁定 revision 與 30 秒 lease；同 key 進行中回 409 `run_in_progress` 與 Retry-After，前端保留 key 重試。過期 lease 可恢復，原執行不可發布。外部服務計費不保證 exactly-once；DB 原子提交避免同一 run 重複報告。
