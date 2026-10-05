# Phase 2 驗收記錄

日期：2026-09-22。變更：`build-decision-backend-phase-2`。

## 結果

| 驗證 | 結果／證據 |
|---|---|
| Python 規則／API／權限 | 20 passed，`services/decision-api/tests/test_decision.py` |
| 前端單元、fixtures、完整 API 範例、雙 Provider 契約 | 15 passed（設 EV_API_TEST_URL）；未連 API 時 12 項 |
| Fixture 桌面／手機 E2E | 26 passed；包含短問卷、略過、草稿、預約、灰燈、模擬、顧問、舊 URL 編輯及寬度檢查 |
| API 瀏覽器 E2E | 3 passed；含不同 browser contexts 與獨立 API process 重啟 |
| 型別、lint、production build | 通過；移除無效 dynamic import 警告 |
| OpenSpec strict validation | 通過 |

API 主流程驗證實際前端填答 → actual v1 → simulation v2（latest 不變）→ 車主分享 → 獨立顧問更新 → actual v3 → 車主與 LINE 同步 → 撤銷分享。另一案例啟動隔離 8001 API，保存報告後停止並重啟程序；重送相同 idempotency key 回同報告，歷史數量不增加，另一車主無法存取。

失敗／邊界測試涵蓋：缺關鍵欄位、僅少數填答不會顯示 100% 完整度、未知／不適用與 0 的區別、未覆蓋與無站、工具故障、灰燈不推薦、家充改善但長途仍不通過、expectedRevision 競爭、payload/key 不符、重評失敗保存待評估 revision、規則變動後依原快照重現。

## 畫面與修復

已產出並檢視本機截圖 `artifacts/screenshots/api-driver-v3.png`、`api-advisor-v3.png`、`api-line-v3.png`。Fixture 截圖亦已更新；產物留本機，避免把測試生成內容混入原簡報。

處理了：舊 `vite.config.js` 蓋過 TS 代理設定、瀏覽器 fetch 呼叫綁定、測試 trace HTML 觸發 Vite 重載、report ID 與 family 混用、顧問固定 fixture、模擬覆蓋正式版、草稿跨 session 混用、角色私有欄位、0 元錯顯為無估算，以及 legacy fixture 編輯無 session。

## 完成度與限制

M2 v0.2 契約及統一入口、M3 本機規則／API／SQLite 已完成本 change 的範圍。規則和資料仍是工程假設，**不代表團隊已核准業務門檻，也不是正式 bZ4X 診斷**。團隊檢核清單见 `rulebook-review.md`。

持有／換購因素、真實 LLM／RAG／TDX、LINE 身分及推播、CRM／企業登入、正式部署仍未實作。顧問身分只供明確本機測試，不能對外開放。種子區域只支援精確行政區文字；未覆蓋回待確認，不偽造附近站點。測試不宣稱正式負載、即時可用性或轉換率成效。

M4 接續條件及可重複操作步驟見 `phase-2-runbook.md`；DB 備份／還原／回退見後端 README。原有簡報修改與素材未在此次後端工作中改寫。
