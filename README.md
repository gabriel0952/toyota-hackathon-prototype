# AIgnite — TOYOTA 轉電路徑顧問

2026 和泰 AI 黑客松提案原型：依使用者的充電、行程與成本條件，規劃轉電路徑，讓官網、LINE 與顧問共用同份評估結果。

本儲存庫僅收錄互動原型，供賽事評審參考。

## 內容

- `prototype/`：官網、LINE 與顧問工作台的前端（Vite + React）。
- `prototype/services/decision-api/`：評估與報告後端（Python）。

## 快速啟動（離線 fixture 模式）

需 Node.js 與 pnpm。

```sh
cd prototype
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

開啟終端顯示的本機網址，例如 `http://127.0.0.1:4173/line`。API 模式、後端啟動與驗證方式見 [`prototype/README.md`](prototype/README.md)。

## 展示範圍與資料

- Fixture 模式不需任何金鑰。API 模式的 TDX 與 Gemini 金鑰須自行於 `.env` 設定，本儲存庫不含任何憑證。
- 示範計算、車款參數與充電站候選僅供展示，不代表正式汽車規格、費率或已驗證成果。
- TOYOTA 圖片取自 TOYOTA 台灣官網，版權屬原權利人，僅用於競賽展示；來源紀錄見 [`prototype/docs/toyota-image-sources.md`](prototype/docs/toyota-image-sources.md)。
