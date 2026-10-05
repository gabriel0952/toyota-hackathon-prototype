import { DiagnosticAnswerSchema, type DiagnosticFields } from './contracts'
export function formAnswer(questionId: string, values: Record<string, string | number>) {
  const keys = questionId === 'vehicle' ? ['vehicle', 'vehicleType', 'ownershipYears', 'vehicleAge'] : questionId === 'locations' ? ['home', 'work', 'leisure', 'parking', 'chargingMethod', 'homeCharging', 'workCharging', 'installAssessment', 'chargingWindow'] : questionId === 'distance' ? ['distance', 'tripFrequency', 'longDistance', 'chargingStop', 'leisure'] : ['monthlyCost', 'monthlyMileage', 'fuelEfficiencyKmPerL', 'homeChargingPercent', 'estimatedTradeInValue', 'plannedOwnershipYears', 'homeChargerCost', 'replacementVehicle']
  const fields: DiagnosticFields = {}
  for (const k of keys) {
    let status: 'provided' | 'unknown' | 'not_applicable' = 'provided'
    const v = values[k]
    if (v === undefined || v === '' || v === 'unknown' || (k === 'monthlyCost' && values.unknownCost === 1) || (k === 'monthlyMileage' && values.unknownMileage === 1)) status = 'unknown'
    if ((k === 'distance' && values.noCommute === 1) || (['longDistance', 'chargingStop'].includes(k) && values.tripFrequency === '幾乎沒有') || (k === 'work' && values.noWork === 1)) status = 'not_applicable'
    fields[k] = { value: status === 'provided' ? (['ownershipYears','vehicleAge','distance','longDistance','chargingStop','monthlyCost','monthlyMileage','fuelEfficiencyKmPerL','homeChargingPercent','estimatedTradeInValue','plannedOwnershipYears','homeChargerCost'].includes(k) ? Number(v) : v) : null, status, source: 'user', updatedAt: new Date().toISOString() }
  }
  return DiagnosticAnswerSchema.parse({ questionId, fields })
}
