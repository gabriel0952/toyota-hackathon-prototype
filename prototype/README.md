# AIgnite EV Path

目前提供兩種模式：可離線展示的 fixture SPA，以及依填答計算、保存報告的本機 API 模式。API 模式可使用已刷新並核對的 TDX 快取與官方 bZ4X 資料；預設以規則與模板產生報告，符合零付費條件時才可啟用 Gemini。LINE 仍是網頁模擬，尚未接入企業系統。

## 前端

在 `prototype/`：

```sh
pnpm install --frozen-lockfile
pnpm dev           # 預設 fixture，127.0.0.1:4173
pnpm dev:api       # API 模式，127.0.0.1:4174
```

API 模式須同時啟動 [後端服務](services/decision-api/README.md)。前端 `/api` 代理到 `127.0.0.1:8000`，啟動命令明確指定 `vite.config.ts`，避免舊版產出的 JS 設定覆蓋。環境參數：`VITE_DATA_PROVIDER=fixture|api`、`VITE_API_BASE_URL=/api/v1`、`VITE_MOCK_LATENCY_MS=180`。非法模式顯示錯誤；API 失敗不回退假資料。切換模式需重啟 Vite。

## 展示

Fixture 固定網址：`/line`、`/driver/report/report-main`（公共黃）、`report-main-v2`（綠）、`report-gray`（灰）、`report-install`（裝樁黃）、`report-pending`（待確認）。What-if 使用 `?tab=whatif`，原始版本不變。`present=1` 隱藏開發展示選單。

API 從 `/driver` 或 `/line` 新建個人 session；填寫後取得 family 最新入口。另一個瀏覽器工作階段開 `/advisor`，登入本機展示顧問；車主分享後才可查看。不要在車主同一工作階段切換顧問身分。操作腳本見 [Phase 2 runbook](docs/phase-2-runbook.md)。

### 報告一直顯示「正在整理」

先確認網址：固定範例報告在 `http://127.0.0.1:4173/driver/report/report-main`；實際計算報告要從 `http://127.0.0.1:4174/driver` 開始填答，不能將兩種模式的 `session-`／`family-` 連結交叉使用。API 模式需同時啟動 8000 後端，並檢查 `http://127.0.0.1:4174/api/v1/health` 回傳 `ok: true`。報告連結還綁定建立它的瀏覽器登入 cookie；換瀏覽器或清除 cookie 後，舊連結無法讀取。

若單次 API 請求持續無回應，頁面在 35 秒後會顯示逾時原因與「重試」，不再無限停在整理畫面。遇到來源故障或尚無報告時，請依頁面錯誤重試或從首頁建立新工作階段；不會自動改用固定範例報告。

充電候選快取超過 24 小時後，報告仍可產生，但過期站點不會列為已確認備援。展示前依 [Phase 3 操作腳本](docs/phase-3-runbook.md) 更新 TDX 來源；更新來源不會改寫舊報告，需重新提交條件產生新版，或從首頁建立新報告。

## 驗證

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
# 先啟動後端，通過 ApiProvider 共用契約：
EV_API_TEST_URL=http://127.0.0.1:8000/api/v1 pnpm test
# 再啟動 4174 API 前端，執行不同 browser contexts 的驗收：
pnpm test:e2e:api
```

API E2E 的重啟案例會暫時使用 8001 與獨立暫存 DB。Fixture E2E 26 個桌面／手機案例；測試截圖存 `artifacts/screenshots/`，trace 存 `test-results/`。請勿把這些示意結果當成正式汽車規格、費率或可用充電站。

[契約 v0.2](docs/api-contract-v0.2.md) · [規則檢核表](docs/rulebook-review.md) · [Toyota 圖片來源](docs/toyota-image-sources.md) · [驗證記錄](docs/phase-2-verification.md)

## Phase 3 真實來源整合

已接入 TDX 快取、官方 bZ4X profile、v0.3 報告與受控 Gemini。預設模板；Gemini 僅限已確認未啟用付費的 Free tier。參考 [操作腳本](docs/phase-3-runbook.md)、[驗收與限制](docs/phase-3-progress.md)、[v0.3 契約](docs/api-contract-v0.3.md)。提案負責人已核對車規與場站候選，使用範圍限展示。
