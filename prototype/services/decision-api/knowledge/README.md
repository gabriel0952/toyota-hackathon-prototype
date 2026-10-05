# 官方知識與審閱

2026-09-23 由 Codex 對 Toyota 台灣 [展示頁](https://www.toyota.com.tw/showroom/bZ4X/) 及其 [完整規配連結](https://www.toyota.com.tw/showroom/bZ4X/fullsepc.aspx) 技術交叉核對：TOYOTA bZ4X 202510 A，適用 2025-10-01 起生產，AC SAE J1772／DC CCS1。

manifest 的 reviewed 代表這次有記錄的官方頁面核對，reviewedBy 現標示提案負責人於 2026-09-23 的展示用途核對；原 Codex 技術交叉核對記錄保留在 `demo-human-review.json` 與外部整合紀錄。**不代表現場驗收或 Toyota 授權**。舊 CCS2 seed 留在 v0.2 歷史，不混入新 profile。

retrievedAt 是取得時間；官方更新時間未提供時維持未知。30 天 validUntil 是內部再次核對期限，不是官方有效期。hash 是去除 contentHash 後的正規化 JSON 一致性檢查，不是官方簽章。

KeywordKnowledge 排除未審阅、衝突、過期、錯誤 profile／角色與禁止模型處理的 claim。模型出口另以 for_model=True 再驗證，僅使用公開引用；缺保固資料不补寫承諾。RAG／其他 API 可替換檢索介面，仍須同樣的版本、引用、新鮮度與權限檢核。

[展示用途人工驗收記錄](demo-human-review.json) 保存對話聲明、車規與場站試點取樣的來源、時間及範圍。只證明提案負責人確認展示資料；即時空位及營運授權均未驗證。
