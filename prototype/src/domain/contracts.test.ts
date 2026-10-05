import examples from '../../docs/examples-v0.2.json'
import { DriverProjectionSchema, validateDecision } from './contracts'
import { describe, expect, it } from 'vitest'
import { ReportSchema } from './contracts'
import { fixtureReports } from '../fixtures/adapter'
const [yellowReport, improvedReport, grayReport] = fixtureReports
import { projectReport } from './projections'

describe('contract v0.2 fixtures', () => {
  it('validates all Golden Fixtures', () => { for (const report of [yellowReport, improvedReport, grayReport]) expect(ReportSchema.parse(report).contractVersion).toBe('0.2') })
  it('returns a field-specific error for invalid reports', () => { const result = ReportSchema.safeParse({ ...yellowReport, id: undefined, path: undefined }); expect(result.success).toBe(false); if (!result.success) expect(result.error.issues.map((i) => i.path.join('.'))).toEqual(expect.arrayContaining(['id', 'path'])) })
  it('protects precise and advisor-only fields', () => { const driver = projectReport(yellowReport, 'driver') as Record<string, unknown>; const line = projectReport(yellowReport, 'line_summary') as Record<string, unknown>; expect(driver.preciseLocations).toBeUndefined(); expect(driver.advisorNotes).toBeUndefined(); expect(line.preciseLocations).toBeUndefined(); expect(line.advisorNotes).toBeUndefined() })
  it('keeps identity and path consistent across roles', () => { const roles = ['driver', 'line_summary', 'advisor'] as const; const projections = roles.map((role) => projectReport(yellowReport, role)); expect(new Set(projections.map((r) => `${r.id}:${r.version}:${r.path}`)).size).toBe(1) })
  it('keeps gray path free of sales content', () => { expect(grayReport.recommendations).toEqual([]); expect(grayReport.successCases).toEqual([]); expect(grayReport.nextActions.every((a) => a.kind === 'reevaluate')).toBe(true) })
})

it('validates complete API examples with the frontend schema', () => { for(const r of [examples.driverResponse,examples.simulationResponse]) expect(validateDecision(DriverProjectionSchema.parse(r)).contractVersion).toBe('0.2') })

import groundedExamples from '../../docs/examples-v0.3.json'
import { AdvisorProjectionSchema } from './contracts'
it('accepts recorded-source v0.3 across roles without changing legacy v0.2', () => {
  for (const r of [groundedExamples.driverResponse, groundedExamples.lineResponse]) {
    expect(validateDecision(DriverProjectionSchema.parse(r)).contractVersion).toBe('0.3')
    expect(DriverProjectionSchema.safeParse({...r, _agentTrace: {tokens: 1}}).success).toBe(false)
  }
  expect(AdvisorProjectionSchema.parse(groundedExamples.advisorResponse).id).toBe(groundedExamples.driverResponse.id)
  expect(DriverProjectionSchema.parse(examples.driverResponse)).toEqual(examples.driverResponse)
})
