# 文件索引

先看 [原型 README](../README.md) 了解功能與啟動方式；以下依用途列出細節文件。

## 現行規格

| 文件 | 內容 |
| --- | --- |
| [api-contract-v0.3.md](api-contract-v0.3.md) | 目前的評估 API：真實來源模式下的 request／三角色 response |
| [api-contract-v0.2.md](api-contract-v0.2.md) | v0.3 沿用的基礎：路徑、cookie、Idempotency-Key、錯誤格式與三角色投影 |
| [examples-v0.3.json](examples-v0.3.json)、[examples-v0.2.json](examples-v0.2.json) | 可直接驗證的完整 request／response／error 範例 |
| [rulebook-review.md](rulebook-review.md) | 燈號判定使用的工程規則與門檻，以及待業務確認項 |

## 操作手冊

| 文件 | 內容 |
| --- | --- |
| [phase-2-runbook.md](phase-2-runbook.md) | API 模式（內建規則）的完整操作腳本：車主 → 分享 → 顧問更新 → 撤銷 |
| [phase-3-runbook.md](phase-3-runbook.md) | 真實來源模式：刷新 TDX 快取、啟用 Gemini 的條件與回退 |

## 驗收與資料來源

| 文件 | 內容 |
| --- | --- |
| [phase-3-progress.md](phase-3-progress.md) | 最新完整驗收：真實 TDX、官方 bZ4X 車規、Gemini 實測與展示限制 |
| [phase-3-live-evidence.json](phase-3-live-evidence.json) | 真實外部呼叫的摘要證據（不含金鑰與使用者資料） |
| [toyota-image-sources.md](toyota-image-sources.md) | TOYOTA 官網圖片的來源與使用位置 |
| [uiux-alignment.md](uiux-alignment.md) | 畫面設計如何對齊團隊範例與服務流程 |
| [images/](images/) | README 使用的畫面截圖（fixture 模式，1280×800） |

## 歷史紀錄（archive）

開發早期階段的紀錄，內容已被上方文件取代，保留供追溯：

- [phase-0-1-verification.md](archive/phase-0-1-verification.md)、[reference-screen-matrix.md](archive/reference-screen-matrix.md)：純 fixture 階段的驗證與畫面對照
- [api-contract-v0.1.md](archive/api-contract-v0.1.md)：最早的前端資料介面
- [phase-2-verification.md](archive/phase-2-verification.md)：後端規則核心完成時的驗收
- [phase-3-external-integrations.md](archive/phase-3-external-integrations.md)：串接 TDX／Gemini 前的官方文件核對
