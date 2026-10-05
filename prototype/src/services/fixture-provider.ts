import { AdvisorProjectionSchema, DemoSessionSchema, DiagnosticAnswerSchema, ReportSchema, type DemoSession, type DiagnosticAnswer, type DiagnosticFields, type ReportRole, type SimulationCondition } from '../domain/contracts'
import { fixtureReports } from '../fixtures/adapter'
import { projectReport } from '../domain/projections'
import { questions } from './questions'
import { ProviderError, type DemoDataProvider } from './provider'
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const storageKey = 'ev-fixture-v02'
const seedSessions = (): Record<string, DemoSession> => Object.fromEntries(fixtureReports.map(r => [r.sessionId, {id:r.sessionId,vehicle:r.vehicle,ownershipYears:r.ownershipYears,questionIndex:0,revision:0,fields:{},answers:[],reportFamilyId:r.reportFamilyId,reportId:r.id}]))
export class FixtureProvider implements DemoDataProvider {
  private sessions: Record<string, DemoSession> = seedSessions()
  private reports = copy(fixtureReports)
  private latest: Record<string, string> = Object.fromEntries(fixtureReports.map(r => [r.reportFamilyId, r.id]))
  private storage: Storage | undefined
  constructor(storage?: Storage) { this.storage = storage; try { const raw = storage?.getItem(storageKey); if (raw) { const data = JSON.parse(raw); this.sessions = { ...seedSessions(), ...Object.fromEntries(Object.entries(data.sessions).map(([k,v]) => [k, DemoSessionSchema.parse(v)])) }; this.reports = data.reports.map((r: unknown) => ReportSchema.parse(r)); this.latest = data.latest } } catch { this.storage?.removeItem(storageKey) } }
  private persist() { this.storage?.setItem(storageKey, JSON.stringify({ sessions: this.sessions, reports: this.reports, latest: this.latest })) }
  private async wait() { const delay = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 180); if (delay) await new Promise(r => setTimeout(r, delay)) }
  async startSession(input?: { scenario?: string }) { await this.wait(); const id = crypto.randomUUID(); const session = DemoSessionSchema.parse({ id, vehicle: 'TOYOTA RAV4 2018', ownershipYears: 7, questionIndex: 0, revision: 0, fields: {}, answers: [], reportFamilyId: `family-${id}` }); this.sessions[id] = session; if (input?.scenario) session.fields.fixtureScenario = { value: input.scenario, status: 'provided', source: 'fixture', updatedAt: new Date().toISOString() }; this.persist(); return copy(session) }
  async getSession(id: string) { const s = this.sessions[id]; if (!s) throw new ProviderError(404, '找不到工作階段'); return copy(s) }
  async saveAnswer(id: string, answer: DiagnosticAnswer) { await this.wait(); answer = DiagnosticAnswerSchema.parse(answer); const s = await this.getSession(id); s.answers = [...s.answers.filter(a => a.questionId !== answer.questionId), answer]; Object.assign(s.fields, answer.fields); s.revision++; s.questionIndex = Math.max(s.questionIndex, questions.findIndex(q => q.id === answer.questionId) + 1); this.sessions[id] = s; this.persist(); return copy(s) }
  async getNextQuestion(id: string) { return questions[(await this.getSession(id)).questionIndex] ?? null }
  async evaluate(id: string) { await this.wait(); const s = await this.getSession(id); const scenario = s.fields.fixtureScenario?.value; if (scenario === 'error') throw new ProviderError(503, '展示資料暫不可用'); const source = (s.reportId && this.reports.find(r => r.id === s.reportId)) || this.reports.find(r => r.id === (scenario === 'gray' ? 'report-gray' : scenario === 'insufficient' ? 'report-pending' : scenario === 'install' ? 'report-install' : 'report-main'))!; const family = s.reportFamilyId!; const report = { ...copy(source), id: `report-${crypto.randomUUID()}`, reportFamilyId: family, sessionId: id, inputRevision: s.revision, version: this.reports.filter(r => r.reportFamilyId === family).length + 1, basedOnReportId: this.latest[family] ?? null, kind: 'actual' as const }; this.reports.push(report); this.latest[family] = report.id; s.reportId = report.id; this.sessions[id] = s; this.persist(); return projectReport(report, 'driver') }
  private find(id: string) { const r = this.reports.find(r => r.id === id); if (!r) throw new ProviderError(404, '找不到此報告版本'); return r }
  async getReport(id: string, role: ReportRole) { await this.wait(); return projectReport(copy(this.find(id)), role) }
  async getLatest(id: string, role: ReportRole) { if (!this.latest[id]) throw new ProviderError(404, '尚無報告'); return this.getReport(this.latest[id], role) }
  async listReports() { return Promise.all(Object.values(this.latest).map(async id => { return AdvisorProjectionSchema.parse(await this.getReport(id, 'advisor')) })) }
  async getReportHistory(family: string, role: ReportRole) { return this.reports.filter(r => r.reportFamilyId === family).map(r => projectReport(copy(r), role)) }
  private revised(id: string, c: SimulationCondition, kind: 'actual' | 'simulation') { const base = this.find(id); const seed = base.path === 'gray' || !base.path ? base : c.value ? this.find('report-main-v2') : this.find('report-main'); const r = { ...copy(seed), id: `report-${crypto.randomUUID()}`, reportFamilyId: base.reportFamilyId, sessionId: base.sessionId, inputRevision: base.inputRevision + (kind === 'actual' ? 1 : 0), version: Math.max(...this.reports.filter(r => r.reportFamilyId === base.reportFamilyId).map(r => r.version)) + 1, kind, basedOnReportId: base.id, changeSummary: ['住家充電可用狀態變更（示意）'] }; this.reports.push(r); if (kind === 'actual') this.latest[base.reportFamilyId] = r.id; this.persist(); return projectReport(r, 'driver') }
  async getComparison(baseId: string, otherId: string, role: ReportRole) { const [base, other] = await Promise.all([this.getReport(baseId, role), this.getReport(otherId, role)]); if (base.reportFamilyId !== other.reportFamilyId) throw new ProviderError(422, '只能比較同一份評估的版本'); return { base, other } }
  async getEvaluationState(family: string) { const r = this.find(this.latest[family]); return { inputRevision: r.inputRevision, evaluatedRevision: r.inputRevision, pending: false } }
  async simulate(id: string, c: SimulationCondition) { return this.revised(id, c, 'simulation') }
  async updateConfirmedCondition(id: string, c: SimulationCondition) { return this.revised(id, c, 'actual') }
  async updateAnswersAndEvaluate(family: string, revision: number, fields: DiagnosticFields) { const base = this.find(this.latest[family]); if (base.inputRevision !== revision) throw new ProviderError(409, '條件已有新版'); return this.revised(base.id, { type: 'home-charger-approved', value: fields.homeCharging?.value === 'available' }, 'actual') }
  async saveAdvisorNote(family: string, note: string) { const r = this.find(this.latest[family]); r.advisorNotes = [note]; this.persist() }
  async setShare() { /* Fixture mode contains only public demonstration identities. */ }
  async loginAdvisor() { /* Fixture role demonstration needs no authentication. */ }
  async reset() { this.sessions = seedSessions(); this.reports = copy(fixtureReports); this.latest = Object.fromEntries(this.reports.map(r => [r.reportFamilyId, r.id])); this.storage?.removeItem(storageKey) }
}
