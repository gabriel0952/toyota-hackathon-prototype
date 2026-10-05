import { ProjectionSchemas, validateDecision, type ReportRole, type VersionedReport } from './contracts'

export function projectReport(report: VersionedReport, role: ReportRole) {
  const { preciseLocations: _precise, advisorNotes, suggestedQuestions, ...publicReport } = report
  const value = role === 'advisor' ? { ...publicReport, advisorNotes, suggestedQuestions } : publicReport
  return validateDecision(ProjectionSchemas[role].parse(value))
}
