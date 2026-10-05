import type { AdvisorProjection, DemoSession, DiagnosticAnswer, DiagnosticFields, DiagnosticQuestion, DriverProjection, ReportRole, SimulationCondition } from '../domain/contracts'
export interface DemoDataProvider {
  startSession(input?: { scenario?: string }): Promise<DemoSession>
  getSession(id: string): Promise<DemoSession>
  saveAnswer(id: string, answer: DiagnosticAnswer): Promise<DemoSession>
  getNextQuestion(id: string): Promise<DiagnosticQuestion | null>
  evaluate(id: string): Promise<DriverProjection>
  getReport(id: string, role: ReportRole): Promise<DriverProjection | AdvisorProjection>
  getLatest(id: string, role: ReportRole): Promise<DriverProjection | AdvisorProjection>
  listReports(): Promise<AdvisorProjection[]>
  getReportHistory(family: string, role: ReportRole): Promise<(DriverProjection | AdvisorProjection)[]>
  getComparison(baseId: string, otherId: string, role: ReportRole): Promise<{ base: DriverProjection; other: DriverProjection }>
  getEvaluationState(family: string): Promise<{ inputRevision: number; evaluatedRevision: number | null; pending: boolean }>
  simulate(id: string, condition: SimulationCondition): Promise<DriverProjection>
  updateConfirmedCondition(id: string, condition: SimulationCondition): Promise<DriverProjection>
  updateAnswersAndEvaluate(family: string, revision: number, fields: DiagnosticFields): Promise<DriverProjection>
  saveAdvisorNote(family: string, note: string): Promise<void>
  setShare(family: string, shared: boolean): Promise<void>
  loginAdvisor(): Promise<void>
  reset(): Promise<void>
}
export class ProviderError extends Error {
  constructor(public status: number, message: string, public retryable = false) { super(message) }
}
