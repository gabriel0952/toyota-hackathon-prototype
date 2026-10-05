import { ReportSchema, type VersionedReport } from '../domain/legacy-contracts'

const shared = {
  contractVersion: '0.1' as const, sessionId: 'session-main', vehicle: 'TOYOTA RAV4 2018', ownershipYears: 7,
  plans: [
    { name: 'Plan A', title: '公司周邊快充', description: '通勤日於公司附近補充 25–35 分鐘', timing: '每週 1 次' },
    { name: 'Plan B', title: '返家順路充電', description: '晚餐或採買時補電，不額外繞行', timing: '視里程彈性使用' },
    { name: 'Plan C', title: '長途備援', description: '台北—台中沿線保留 2 個替代站點', timing: '每月長途前確認' },
  ],
  journeys: [
    { label: '平日', title: '住家 → 公司', detail: '單程 18 km，公司周邊有 3 個備選站點' },
    { label: '返家', title: '公司 → 採買 → 住家', detail: '把補電放進既有生活路線' },
    { label: '休閒', title: '台北 → 台中', detail: '主站 + 兩個備援，降低里程焦慮' },
  ],
  assumptions: ['每月台北—台中往返 1 次', '家用充電尚待社區確認', '以目前用車里程估算'],
  sources: [{ label: '充電站與成本', status: 'fixture' as const, updatedAt: '2026-08-30T10:00:00+08:00' }],
  blurredLocations: ['台北市內湖區（約略）', '台北市南港區（約略）', '台中市西屯區（約略）'],
  preciseLocations: { home: '台北市內湖區示意路 88 號', work: '台北市南港區示意路 10 號', leisure: '台中市西屯區示意路 5 號' },
}

export const yellowReport: VersionedReport = ReportSchema.parse({ ...shared, id: 'report-main', version: 1, createdAt: '2026-08-30T10:00:00+08:00', path: 'yellow', pathLabel: '公共充電可行路徑', headline: '現在可以轉電，先用公共充電跑順生活', summary: '你的固定通勤與長途需求已有可行備援；家充若確認，路徑會再升級。', completeness: 86,
  resistances: [
    { id: 'home', title: '家用充電待確認', score: 68, description: '社區尚未確認施工與電力條件', status: 'pending' },
    { id: 'long-trip', title: '長途備援', score: 34, description: '台北—台中需保留替代站點', status: 'manageable' },
    { id: 'habit', title: '補電習慣轉換', score: 22, description: '將每週一次補電放入既有採買行程', status: 'manageable' },
  ], monthlyCost: { min: 2100, max: 3100, note: '依示意里程與公共充電費率估算' },
  recommendations: ['續航足以覆蓋日常通勤與月度長途', '快充能力適合 Plan A/B/C 備援', 'Toyota 服務接點可承接轉電諮詢'],
  successCases: ['示意案例：相似通勤族以每週一次補電完成轉換'],
  nextActions: [{ label: '預約充電條件諮詢', kind: 'consult' }, { label: '帶著常跑路線試駕', kind: 'test-drive' }],
  advisorNotes: ['先釐清社區管委會與車位電力條件', '避免直接推車，先確認補電路徑'], pendingConfirmations: ['住家車位是否可申請充電設備'], suggestedQuestions: ['您的固定車位是自有還是承租？', '管委會是否曾討論充電設備？'] })

export const improvedReport: VersionedReport = ReportSchema.parse({ ...yellowReport, id: 'report-main-v2', version: 2, createdAt: '2026-08-30T10:08:00+08:00', path: 'green', pathLabel: '居家充電優先路徑', headline: '家充成立，轉電路徑已完整', summary: '日常以居家補電為主，公共快充成為長途備援。', completeness: 96,
  resistances: [
    { id: 'home', title: '家用充電已確認', score: 8, description: '固定車位與申請條件已確認', status: 'resolved' },
    { id: 'long-trip', title: '長途備援', score: 22, description: '沿線備援站點可覆蓋需求', status: 'manageable' },
    { id: 'habit', title: '補電習慣', score: 10, description: '返家插電即可完成日常補能', status: 'resolved' },
  ], plans: [
    { name: 'Plan A', title: '居家日常補電', description: '返家停車時補電，覆蓋日常通勤需求', timing: '依用車里程安排' },
    { name: 'Plan B', title: '公司周邊快充備援', description: '臨時增加里程或無法在家充電時使用', timing: '需要時補電' },
    { name: 'Plan C', title: '長途沿線備援', description: '台北—台中沿線保留替代充電站', timing: '出發前確認站況' },
  ], assumptions: ['每月台北—台中往返 1 次', '固定車位與家充申請條件成立', '以目前用車里程估算'],
  suggestedQuestions: ['您平常返家後會停車多久？', '下一次長途出發前，是否一起確認沿途備援？'],
  monthlyCost: { min: 1250, max: 1900, note: '家用電價與示意里程估算' }, pendingConfirmations: [], advisorNotes: ['家充條件已由顧問確認，可進入方案評估'], nextActions: [{ label: '預約到府充電評估', kind: 'consult' }, { label: '預約 bZ4X 路線試駕', kind: 'test-drive' }] })

// The gray counterexample must not inherit the yellow report's charging plans or trips.
export const grayReport: VersionedReport = ReportSchema.parse({ ...shared, id: 'report-gray', sessionId: 'session-gray', version: 1, createdAt: '2026-08-30T10:00:00+08:00', path: 'gray', pathLabel: '條件尚未成熟', headline: '先不用急著換，等兩個條件改變再評估', summary: '目前沒有固定停車或補電節點，且高頻長途缺少穩定備援。', completeness: 72,
  plans: [],
  journeys: [
    { label: '平日通勤', title: '每日往返約 60 km', detail: '沒有固定停車點，日常只能靠公共站補電，生活圈內目前找不到穩定的補電節點' },
    { label: '長途返鄉／出遊', title: '每週跨城往返', detail: '高頻長途需要可靠的目的地與沿途備援，目前候選站不足，暫不建議轉電' },
  ],
  assumptions: ['沒有固定停車位，無法安裝家充', '工作地沒有可用充電', '每週跨城長途，備援站點不足'],
  resistances: [
    { id: 'parking', title: '沒有固定停車點', score: 92, description: '無法建立穩定日常補電節點', status: 'high' },
    { id: 'charging', title: '工作地無可用充電', score: 85, description: '主要活動範圍缺乏穩定替代方案', status: 'high' },
    { id: 'long-trip', title: '長途頻率偏高', score: 78, description: '每週跨城且備援站不穩定', status: 'high' },
  ], monthlyCost: { min: 0, max: 0, note: '條件不足，暫不估算' }, recommendations: [], successCases: [],
  nextActions: [{ label: '固定停車或公司充電成立時重新評估', kind: 'reevaluate' }], advisorNotes: ['保持低壓追蹤，不安排購車推進'], pendingConfirmations: [], suggestedQuestions: ['若未來有固定車位，是否願意再次評估？'] })

export const allReports = [yellowReport, improvedReport, grayReport]
