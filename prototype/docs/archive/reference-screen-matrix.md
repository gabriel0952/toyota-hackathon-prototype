# Phase 0/1 參考畫面與 Demo 狀態矩陣

基準視窗：桌面 1280×720、1440×900；Driver 與 LINE 行動版 390×844。AIgnite 尚無權威 Logo 檔，Phase 0/1 暫用「AIgnite」文字標誌（橘色火花點），待品牌檔確認後替換。

| 參考素材 | 對應路由 / 狀態 | 類型 | 互動與資料 |
|---|---|---|---|
| LINE-01-保養後觸發.png | `/line?state=invite&present=1` | interactive | 保養後邀請、單一顧慮、session/vehicle |
| LINE-02-導向官網與結果.png | `/line/result/report-main?present=1` | interactive | 診斷 CTA、path/report id、摘要 |
| LINE-03-略過與停止.png | `/line?state=skip`、`state=stop` | interactive | 略過與停止狀態 |
| 網頁 09_53_57 (1) | `/driver?present=1` | interactive | 三個核心問題、開始診斷 |
| 網頁 09_53_57 (2) | `/driver/diagnostic?present=1` | interactive | 卡片題、進度、回上一題 |
| 網頁 09_53_58 (3) | `/driver/diagnostic?step=3&present=1` | interactive | 滑桿、車輛/成本、三個位置錨點 |
| 網頁 09_53_58 (4) | `/driver/analysis?present=1` | navigable-only | 四階段可解釋分析進度 |
| 網頁 09_53_59 (5) | `/driver/report/report-main?scenario=yellow-public&present=1` | interactive | 黃色路徑、阻力與 CTA |
| 報告 10_39_39 (1) | yellow report `tab=overview` | interactive | 路徑、完整度、前三阻力 |
| 報告 10_39_39 (2) | yellow report `tab=charging` | interactive | 本機 SVG 地圖、Plan A/B/C |
| 報告 10_39_40 (3) | yellow report `tab=journey` | interactive | 平日/返家/休閒情境軸 |
| 報告 10_39_40 (4) | yellow report `tab=cost` | interactive | 成本區間與資料註記 |
| 報告 10_39_40 (5) | yellow report `scenario=after-home-install` | interactive | What-if v1/v2 比較 |
| 業務後台 10_57_57 | `/advisor?present=1` | interactive | 黃/綠/灰名單 |
| 業務後台 10_58_10 | `/advisor/reports/report-main?present=1` | interactive | 模糊位置、待確認、建議問句 |
| 業務後台 10_58_23 | advisor improved version | interactive | 確認家充、新版本與下一步 |

所有成本、充電站、bZ4X 適配原因與成功案例均為「Demo 示意資料」，畫面需顯示示意標籤；不得將其宣稱為即時 TDX、報價、官方規格或真實客戶證言。截圖專用狀態使用 `present=1` 隱藏開發工具，但主要控制仍可操作。
