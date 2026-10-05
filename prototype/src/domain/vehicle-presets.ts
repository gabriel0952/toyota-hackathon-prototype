// Common current-vehicle presets (CDP reference data) used to prefill the questionnaire.
// Names deliberately contain the backend CURRENT_PRESETS keys (ALTIS, RAV4, CAMRY…) so the
// decision API resolves the same maintenance/tax/fuel assumptions.
export type VehiclePreset = { name: string; newPrice: number; avgHoldYears: number; fuelEco: number; annualMaint: number; annualTax: number; vehicleType: '汽油車' | '油電車' }

export const CDP_DATABASE: Record<string, VehiclePreset> = {
  ALTIS: { name: 'Corolla Altis 1.8', newPrice: 780000, avgHoldYears: 11.1, fuelEco: 15.6, annualMaint: 15200, annualTax: 11920, vehicleType: '汽油車' },
  RAV4: { name: 'RAV4 2.0', newPrice: 1010000, avgHoldYears: 8.5, fuelEco: 13.8, annualMaint: 18500, annualTax: 17440, vehicleType: '汽油車' },
  RAV4_HV: { name: 'RAV4 2.5 Hybrid', newPrice: 1150000, avgHoldYears: 3.9, fuelEco: 20.1, annualMaint: 16800, annualTax: 17440, vehicleType: '油電車' },
  CAMRY: { name: 'Camry 2.0', newPrice: 980000, avgHoldYears: 9.2, fuelEco: 12.0, annualMaint: 18756, annualTax: 17440, vehicleType: '汽油車' },
  CROSS: { name: 'Corolla Cross 1.8', newPrice: 850000, avgHoldYears: 3.2, fuelEco: 14.9, annualMaint: 14800, annualTax: 11920, vehicleType: '汽油車' },
  YARIS: { name: 'Yaris / VIOS 1.5', newPrice: 650000, avgHoldYears: 10.5, fuelEco: 16.5, annualMaint: 13200, annualTax: 11920, vehicleType: '汽油車' },
  SIENTA: { name: 'Sienta 1.8', newPrice: 790000, avgHoldYears: 6.8, fuelEco: 14.6, annualMaint: 15800, annualTax: 11920, vehicleType: '汽油車' },
}

export const findVehiclePreset = (vehicle: unknown) => Object.values(CDP_DATABASE).find(preset => preset.name === String(vehicle ?? '').trim())

// 中古車折抵殘值演算模型：新車均價 × 車齡折舊係數，無條件捨去至千位數
export function estimateTradeInValue(newPrice: number, vehicleAge: unknown): number | null {
  const age = Number(vehicleAge)
  if (vehicleAge === '' || !Number.isFinite(age) || age < 0) return null
  const years = Math.max(1, age)
  const factor = years <= 2 ? 0.65 : years <= 4 ? 0.48 : years <= 7 ? 0.32 : years <= 10 ? 0.20 : 0.12
  return Math.floor((newPrice * factor) / 1000) * 1000
}
