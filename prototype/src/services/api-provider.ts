import { z } from 'zod'
import { AdvisorProjectionSchema, DemoSessionSchema, DriverProjectionSchema, ProjectionSchemas, validateDecision, type DiagnosticAnswer, type DiagnosticFields, type ReportRole, type SimulationCondition } from '../domain/contracts'
import { questions } from './questions'
import { ProviderError, type DemoDataProvider } from './provider'
export class ApiProvider implements DemoDataProvider {
  private confirmations = new Map<string, DiagnosticFields>()
  private evaluations = new Map<string, Promise<import("../domain/contracts").DriverProjection>>()
  private revisions = new Map<string, number>()
  private pending = new Map<string, string>()
  constructor(private base = '/api/v1', private fetcher: typeof fetch = fetch) {}
  private async call(path: string, method = 'GET', body?: unknown) {
    const payload = JSON.stringify(body); const logical = `${method}:${path}:${payload}`
    let key = this.pending.get(logical)
    if (!key) { key = crypto.randomUUID(); this.pending.set(logical, key) }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 35000)
    try {
      const response = await this.fetcher.call(globalThis, this.base + path, { method, credentials: 'include', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: payload }) })
      const result = await response.json().catch((error) => { if (controller.signal.aborted) throw error; return null })
      if (!response.ok) {
        const retryable = response.status >= 500 || ['run_in_progress', 'run_superseded'].includes(result?.detail?.code)
        if (!retryable) this.pending.delete(logical)
        throw new ProviderError(response.status, typeof result?.detail === 'string' ? result.detail : result?.detail?.message ?? '資料格式或存取權限有誤', retryable)
      }
      this.pending.delete(logical)
      return result
    } catch (error) {
      if (error instanceof ProviderError) throw error
      if (controller.signal.aborted) throw new ProviderError(504, '報告等候逾時。填答已保留，請按「重試」；若持續發生，請檢查後端服務。', true)
      throw new ProviderError(503, '無法連線，填答仍保留，請重試', true)
    } finally {
      clearTimeout(timeout)
    }
  }
  async startSession(input?: { scenario?: string }) { const s = DemoSessionSchema.parse(await this.call('/sessions', 'POST', input ?? {})); this.revisions.set(s.id, s.revision); return s }
  async getSession(id: string) { const s = DemoSessionSchema.parse(await this.call(`/sessions/${id}`)); this.revisions.set(id, s.revision); return s }
  async saveAnswer(id: string, answer: DiagnosticAnswer) { const revision = this.revisions.get(id) ?? (await this.getSession(id)).revision; const s = DemoSessionSchema.parse(await this.call(`/sessions/${id}/answers`, 'PUT', { ...answer, expectedRevision: revision, contractVersion: '0.2' })); this.revisions.set(id, s.revision); return s }
  async getNextQuestion(id: string) { const state = z.object({ index: z.number().int() }).parse(await this.call(`/sessions/${id}/next-question`)); return questions[state.index] ?? null }
  async evaluate(id: string) {
    if (this.evaluations.has(id)) return this.evaluations.get(id)!
    const operation = (async () => { const revision = this.revisions.get(id) ?? (await this.getSession(id)).revision; return validateDecision(DriverProjectionSchema.parse(await this.call('/evaluations', 'POST', { sessionId: id, expectedRevision: revision, contractVersion: '0.3', targetVehicleProfileId: 'toyota-tw-bz4x-202510-a' }))) })()
    this.evaluations.set(id, operation)
    try { return await operation } finally { this.evaluations.delete(id) }
  }
  async getReport(id: string, role: ReportRole) { return validateDecision(ProjectionSchemas[role].parse(await this.call(`/reports/${id}?role=${role}`))) }
  async getLatest(id: string, role: ReportRole) { return validateDecision(ProjectionSchemas[role].parse(await this.call(`/report-families/${id}/latest?role=${role}`))) }
  async listReports() { return AdvisorProjectionSchema.array().parse(await this.call('/reports?role=advisor')).map(validateDecision) }
  async getReportHistory(id: string, role: ReportRole) { return ProjectionSchemas[role].array().parse(await this.call(`/report-families/${id}/versions?role=${role}`)).map(validateDecision) }
  async getComparison(baseId: string, otherId: string, role: ReportRole) { const [base, other] = await Promise.all([this.getReport(baseId, role), this.getReport(otherId, role)]); if (base.reportFamilyId !== other.reportFamilyId) throw new ProviderError(422, '只能比較同一份評估的版本'); return { base, other } }
  async getEvaluationState(family: string) { return z.object({ inputRevision: z.number(), evaluatedRevision: z.number().nullable(), pending: z.boolean() }).strict().parse(await this.call(`/report-families/${family}/evaluation-state`)) }
  async simulate(id: string, condition: SimulationCondition) { const result = await this.call(`/reports/${id}/simulate`, 'POST', condition); return validateDecision(DriverProjectionSchema.parse(result)) }
  async updateConfirmedCondition(id: string, condition: SimulationCondition) {
    const r = await this.getReport(id, 'advisor'); const key = `${id}:${condition.value}`
    let fields = this.confirmations.get(key)
    if (!fields) { fields = { homeCharging: { value: condition.value ? 'available' : 'unavailable', status: 'provided', source: 'advisor', updatedAt: new Date().toISOString() } }; this.confirmations.set(key, fields) }
    try { const result = await this.updateAnswersAndEvaluate(r.reportFamilyId, r.inputRevision, fields); this.confirmations.delete(key); return result } catch(e) { if (e instanceof ProviderError && e.status < 500 && !e.retryable) this.confirmations.delete(key); throw e }
  }
  async updateAnswersAndEvaluate(family: string, revision: number, fields: DiagnosticFields) { const result = await this.call(`/report-families/${family}/condition-updates`, 'POST', { fields, expectedRevision: revision, contractVersion: '0.2' }); const schema = result && 'advisorNotes' in result ? AdvisorProjectionSchema : DriverProjectionSchema; return validateDecision(schema.parse(result)) }
  async saveAdvisorNote(family: string, note: string) { z.object({ saved: z.boolean() }).parse(await this.call(`/report-families/${family}/advisor-note`, 'PUT', { note })) }
  async setShare(family: string, shared: boolean) { z.object({ shared: z.boolean() }).parse(await this.call(`/report-families/${family}/share`, shared ? 'POST' : 'DELETE', shared ? { advisorId: 'demo-advisor' } : undefined)) }
  async loginAdvisor() { z.object({ actor: z.string(), role: z.literal('advisor') }).parse(await this.call('/demo/identity', 'POST', {})) }
  async reset() { await this.call('/demo/reset', 'POST', {}); this.revisions.clear(); this.pending.clear() }
}
