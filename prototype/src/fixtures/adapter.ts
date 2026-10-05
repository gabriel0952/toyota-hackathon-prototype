import { ReportSchema, type VersionedReport } from '../domain/contracts'
import type { VersionedReport as Legacy } from '../domain/legacy-contracts'
import { allReports } from './reports'
const demoTco = {
  status: 'estimated' as const, version: 'tco-scenario-1', comparisonVehicle: 'RAV4 2.0', plannedOwnershipYears: 5,
  note: '固定展示情境；不含貸款、保險、期末殘值及未提供的停車或服務費。',
  breakEvenVsNewIceYears: 9.14, breakEvenVsKeepYears: null, fiveYearSavingsVsNewIce: -151873,
  fiveYearSavingsVsKeep: -768854, annualEnergySavingsRate: 62,
  annualEnergyCost: { current: 57600, newIce: 29647, bz4x: 21888 },
  curves: { years: [0,1,2,3,4,5,6,7,8,9,10], current: [0,96870,195309,295370,397110,500586,605856,712980,822021,933043,1046111], newIce: [810000,871087,932384,993894,1055621,1117567,1179736,1242131,1304756,1367614,1430709], bz4x: [1140000,1165888,1191776,1217664,1243552,1269440,1295328,1321216,1347104,1372992,1398880] },
  fiveYearBreakdown: { current: { purchase: 0, energy: 288000, maintenance: 125386, tax: 87200 }, newIce: { purchase: 810000, energy: 148235, maintenance: 72132, tax: 87200 }, bz4x: { purchase: 1140000, energy: 109440, maintenance: 20000, tax: 0 } },
  inputs: { annualMileage: 14400, vehicleAge: 8, fuelEfficiencyKmPerL: 13.8, homeChargingPercent: 40, weightedElectricityRate: 7.6, tradeInValue: 200000, homeChargerCost: 60000 },
  inputSources: { monthlyMileage: 'fixture', monthlyFuelCost: 'fixture', vehicleAge: 'fixture', fuelEfficiency: 'fixture', homeChargingPercent: 'fixture', tradeInValue: 'fixture' },
}
export function adaptLegacy(r: Legacy): VersionedReport {
  return ReportSchema.parse({ ...r, sessionId: r.id === 'report-main' ? 'session-main' : `session-${r.id}`, contractVersion: '0.2', reportFamilyId: `family-${r.id}`, inputRevision: 0, ruleVersion: 'fixture-legacy-v1', dataSnapshotIds: ['fixture-2026-08-30'], kind: 'actual', basedOnReportId: null, changeSummary: [], evaluationStatus: 'assessed', route: r.path === 'green' ? 'ready' : r.path === 'gray' ? 'not_ready' : 'public_charging_ready', chargingDataStatus: 'available',
    monthlyCost: { ...r.monthlyCost, status: r.monthlyCost.max ? 'estimated' : 'unavailable', min: r.monthlyCost.max ? r.monthlyCost.min : null, max: r.monthlyCost.max || null, unit: 'TWD/month', inputs: {}, formula: 'legacy demonstration, not calculated' }, tcoAnalysis: demoTco,
    resistances: r.resistances.map(v => ({ ...v, evidence: ['示意資料'], improvement: v.description })) })
}
const base = allReports.map(adaptLegacy)
export const fixtureReports = [...base,
  ReportSchema.parse({ ...base[0], id: 'report-install', sessionId: 'session-install', reportFamilyId: 'family-install', route: 'home_install_required', pathLabel: '裝樁後可轉', headline: '先落實家充，再安排轉電', summary: '裝樁初評通過的示意條件；仍需安裝確認。' }),
  ReportSchema.parse({ ...base[0], id: 'report-pending', sessionId: 'session-pending', reportFamilyId: 'family-pending', path: null, route: null, evaluationStatus: 'needs_confirmation', pathLabel: '待確認', headline: '先補齊條件，再判斷路徑', recommendations: [], successCases: [], nextActions: [{ label: '補充條件', kind: 'reevaluate' }], pendingConfirmations: ['補電地區與時段'], chargingDataStatus: 'no_data', plans: [] })]
