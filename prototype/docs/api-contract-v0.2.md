# Frontend contract v0.2

v0.1 封存作為 legacy fixture 格式；目前 `domain/contracts.ts` 與 `services/provider.ts` 是前端界面。三個 route 群組只透過 client 讀取，不直接引用 fixture。LINE 是網頁模擬呈現，與 Driver 共用公開欄位 schema；Advisor 多內部筆記／建議問句，不含精確位置。

## 輸入

每欄 `{value, status, source, updatedAt}`。status 為 provided / unknown / not_applicable；後兩者 value 必須 null。來源以伺服器身分覆寫成 user/advisor，不能自行提升角色。數字欄位驗證非負、有限與上限；未知鍵拒絕。每次提交 expectedRevision；過期回 409，保留本頁草稿並提示重新載入。

四步為 vehicle、locations、distance、charging。選填長途距離／停靠不帶隱藏數值；0 元、0 km 與 unknown 不同。沒有固定通勤為 not_applicable。區域以文字與種子中的 resolvedAreaCode 對應，精確比對範圍之外回 no_data。

## 版本

- `reportFamilyId`：一組評估；`/report-families/{id}/latest` 僅讀最新 actual。
- `id`：不可變單一版本；歷史、模擬使用它。未知 ID 回 404。
- `kind` actual / simulation；simulation 保留 basedOnReportId，不修改 latest 或正式輸入。
- `inputRevision`、`ruleVersion`、`dataSnapshotIds`：追溯輸入與規則／工具回應。
- `evaluationStatus` needs_confirmation 時 route/path 均 null；assessed 才有四條 route 與三色 path。
- `monthlyCost` unavailable 時 min/max 必為 null；estimated 含單位、公式與輸入，0 為合法估計。
- 灰燈／待確認無購車推薦及成功案例，只提供改善重評。

## 介面與錯誤

API 路由的完整 schema 可由 `/openapi.json` 取得；`examples-v0.2.json` 為測試服務實際生成的完整範例（非真實車主）。`getComparison` 用兩份同 family 的授權單版結果比較；`getEvaluationState` 顯示已保存、尚未評估的 revision，不修改歷史報告。

401 未建立身分；403 未授權；404 不存在；409 revision/key 衝突；422 格式不合法；503 工具／連線失敗。`no_data` 是無覆蓋，`no_nearby_station` 是已查明沒有符合站點。工具故障回 503，不得當作無站或切回 fixture。

評估／模擬／條件更新須帶 Idempotency-Key，同身分、路由、key 绑定相同 payload；重試傳回原結果。條件提交的工具失敗會保存輸入 revision 與待評估狀態，舊 actual 仍有效；以原 key/payload 重試。Client 保存未完成請求的 key，顧問確認重試沿用原欄位時間戳。

## 存取與同步

本機匿名 owner cookie 持有 session；明確 demo 開關的顧問 cookie 在另一瀏覽器工作階段建立。車主授權後才能讀取／更新，撤銷後下次請求即拒絕。公開 response 在嚴格 runtime schema 拒收內部欄位。

最新入口 5 秒輪詢、可見／focus 時重取、故障退避至 60 秒。單一版本頁不自動跳版。已有內容遇到授權失敗會移除，不保留可繼續讀取的舊畫面。
