# Decision API v0.3

路徑、cookie／授權、Idempotency-Key 與錯誤 envelope 沿用 [v0.2](api-contract-v0.2.md)。四步問卷及既有車款欄位不變；`vehicle` 表示車主原車，評估請求明確提供 `targetVehicleProfileId=toyota-tw-bz4x-202510-a` 與 `contractVersion=0.3`。

完整可驗證資料見 [request／三角色 response／error](examples-v0.3.json)。範例以虛構車主、真實公開 TDX 快取生成，非當下空位。後端 `grounded/report.py` 與前端 Zod 的 Driver／LINE／Advisor projection 驗證一致；driver／LINE 不接受顧問筆記、精確位置或內部 trace。

v0.3 增加 `targetVehicleProfileId`、`engineVersion`、`composerVersion`、`evaluatedAt`、`generationMode`、`composition`、`citations`，sources 保留 snapshot／origin／retrievedAt／sourceUpdatedAt／freshness／coverage／missingFields；plan 保留站點、來源與限制。未知資料不生成已確認條件。

v0.1 fixture 經明確 adapter 保留識別與原決策，v0.2 歷史 payload 不回填或改寫。前端使用版本 discriminator；未知版本拒絕。原網址可讀，歷史來源未虛構為真實資料。

LLM 結果僅生成一次後保存；重讀、三端投影與重播不再呼叫模型。過期 run 不發布，來源失敗保留待評估 revision；模型故障則以同一規則決策產生模板。
