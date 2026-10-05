# DemoDataProvider contract v0.1（Frozen）

未來 `ApiProvider` 必須實作 `src/services/demo-data.ts` 的介面，並通過 `providerContract()` 測試。UI 只依賴 `DemoDataClient`，不得直接 import fixture JSON。

## 範例

```json
{"operation":"startSession","request":{"scenario":"yellow-public"},"response":{"id":"session-main","vehicle":"TOYOTA RAV4 2018","ownershipYears":7,"questionIndex":0,"answers":[]}}
```

```json
{"operation":"saveAnswer","request":{"sessionId":"session-main","answer":{"questionId":"charging","value":"公司周邊公共充電"}},"response":{"id":"session-main","questionIndex":1}}
```

```json
{"operation":"evaluate","request":{"sessionId":"session-main"},"response":{"contractVersion":"0.1","id":"report-main","version":1,"path":"yellow"}}
```

```json
{"operation":"simulate","request":{"reportId":"report-main","condition":{"type":"home-charger-approved","value":true}},"response":{"contractVersion":"0.1","id":"report-main-v2","version":2,"path":"green"}}
```

角色投影必須維持相同 `id/version/path/resistances` 語意；driver 與 line_summary 禁止傳回 `preciseLocations`、`advisorNotes`、`suggestedQuestions`。
