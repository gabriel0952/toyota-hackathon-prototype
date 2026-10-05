# Phase 3 實作與驗收紀錄

完成 **33／33 項**；本階段僅限展示。

更新：2026-09-23。Change：`integrate-grounded-agent-phase-3`。

已串接 v0.3 API、真實 TDX 快取、Toyota 官方車規、受控 Gemini 工具呼叫、模板降級及車主／LINE 示意／顧問三端。完成範圍以 OpenSpec tasks 為準；提案負責人已於 2026-09-23 完成人工資料核對，並確認僅限展示；這不構成現場查驗或正式營運核准。

## 實際外部驗收

- TDX 授權請求取得 Station 443 筆、Connector 1936 筆、ServiceTime 443 筆、LiveStatuses 1632 筆，保存不可變原始快照。區域可辨識的內湖候選 4 站；缺少行政區的其餘站不任意歸類，整體標記 partial。
- Toyota 台灣 bZ4X 展示頁連結的完整規配表：202510 A、適用 2025-10-01 起生產；AC SAE J1772／DC CCS1。由 Codex 對官方頁面技術交叉核對，並由提案負責人於 2026-09-23 確認展示資料正確。舊 CCS2 種子只存在於歷史 v0.2。
- Gemini 2.5 Flash：使用者確認 Free tier 且未啟用付費。真實 smoke 1 次，793 tokens／1207 ms；三端 E2E 另有 3 次生成，共 2372 tokens，1174–1362 ms。合計 4 次、3165 tokens。費用依未啟用付費的方案為 0 USD；不是帳務 API 稽核。
- `finish_report` 真實 function call 通過結構驗證；控制器先取得車規／TDX／成本證據並計算規則。LLM 僅選擇允許的說明、動作與引用，不判定燈號或改寫金額。
- 保留不含金鑰、使用者問卷及模型思考的摘要：[live evidence](phase-3-live-evidence.json)。真實來源＋template 與真實來源＋LLM 都完成瀏覽器驗收。

## 檢查結果

| 檢查 | 結果 |
|---|---|
| 後端 pytest | 82 passed：規則、未知／過期／部分來源、無 seed fallback、migration、lease、權限、模型降級、重播與零付費設定保護 |
| 前端單元／契約 | 14 passed；含 v0.3 API Provider conformance 共 17 passed |
| 原展示頁桌面／手機 E2E | 26 passed |
| 舊版 API E2E | 3 passed，含重啟、授權及故障 |
| grounded template E2E | 1 passed，刷新後再次通過 |
| 瀏覽器故障注入 | 4 passed：stale／unknown、partial、pending 保留、工具失敗及私有 trace 拒絕 |
| grounded Gemini Free tier E2E | 1 passed；填答、三端、模擬、更新、歷史與撤銷 |
| typecheck／lint／build | 通過 |

模型 timeout／429／格式錯誤以受控故障測試驗證；未故意耗尽真實免費額度。關鍵工具失敗保持 pending revision 與舊報告；資料刷新不自動發布新個人報告。歷史重播使用 engines/v02 或 engines/v03 的凍結程式及原來源／規則；讀取不呼叫模型。

畫面證據存於 `prototype/artifacts/screenshots/grounded-*.png`（本機忽略版控）。來源展開區顯示新鮮度、範圍與生成模式，不把快取稱為即時；真實報告不顯示 fixture 地圖。

## 展示限制

- 檢核責任人為提案負責人本人；車規與 TPE1773 試點候選已依現有官方頁面與真實 TDX 取樣人工核對並限展示。審核聲明與取樣證據見 [human review](../services/decision-api/knowledge/demo-human-review.json)。未宣稱現場空位、正式營運或資料再散布權。
- 靜態 TTL 24 小時、動態 TTL 5 分鐘；缺時間不冒充新鮮。動態資料已取得並測試過期處理，畫面仍不承諾現場空位。
- 工程假設：可用續航 300 km、耗能 18 kWh/100km，以及能源價格／損耗與決策門檻；不是官方續航保證、現場報價或商業核准。
- 目前沒有 routing；只查目的地候選，不宣稱沿途或完整長途可行。未覆蓋／未確認不等於已知無站。
- Gemini 免費方案確認是本機啟用條件，程式不能查證 Google 帳務是否日後被人啟用。換 key／專案需重新確認；預設保留 template。
- M5：真實 LINE webhook／身分綁定、企業登入、CRM、主動通知、正式部署、營運責任／稽核與資料治理仍未實作。

5.4 採分層驗證：瀏覽器故障注入檢查顯示與不回退 seed；後端整合測試檢查模型降級、來源刷新不發布與私有 claim 權限；不把注入測試稱為真實供應商故障。OpenSpec strict validation 與 git diff whitespace 檢查通過。
