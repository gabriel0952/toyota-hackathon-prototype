import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FixtureProvider, ApiProvider, createProvider, type DemoDataProvider } from './demo-data'
import { DriverProjectionSchema, type DiagnosticFields } from '../domain/contracts'
const values = { vehicle:'RAV4', distance:18, tripFrequency:'幾乎沒有', homeCharging:'unavailable', workCharging:'unavailable', installAssessment:'failed', home:'台北市內湖區', chargingWindow:'day', monthlyMileage:1200 }
const fields: DiagnosticFields = Object.fromEntries(Object.entries(values).map(([k,v]) => [k,{value:v,status:'provided',source:'user',updatedAt:'2026-09-22T00:00:00Z'}]))
export function providerContract(name: string, factory: () => DemoDataProvider) {
  describe(`${name} v0.2 conformance`, () => {
    let provider: DemoDataProvider
    beforeEach(() => { provider = factory() })
    it('creates independent sessions and restores structured answers', async () => {
      const a = await provider.startSession(), b = await provider.startSession()
      expect(a.id).not.toBe(b.id)
      const updated = await provider.saveAnswer(a.id, {questionId:'charging',fields})
      expect(updated.revision).toBe(1); expect((await provider.getSession(b.id)).fields).toEqual({})
      expect((await provider.getSession(a.id)).fields.monthlyMileage.value).toBe(1200)
    })
    it('preserves immutable actual reports across simulation and update', async () => {
      const s = await provider.startSession(); await provider.saveAnswer(s.id,{questionId:'charging',fields})
      const original = await provider.evaluate(s.id)
      const simulated = await provider.simulate(original.id,{type:'home-charger-approved',value:true})
      expect((await provider.getComparison(original.id, simulated.id, 'driver')).base.id).toBe(original.id); expect(simulated.kind).toBe('simulation'); expect(simulated.basedOnReportId).toBe(original.id)
      expect((await provider.getLatest(original.reportFamilyId,'driver')).id).toBe(original.id)
      const updated = await provider.updateAnswersAndEvaluate(original.reportFamilyId,original.inputRevision,{homeCharging:{...fields.homeCharging,value:'available'}})
      expect(updated.kind).toBe('actual'); expect(updated.version).toBeGreaterThan(simulated.version)
      expect(await provider.getReport(original.id,'driver')).toEqual(original)
      expect((await provider.getLatest(original.reportFamilyId,'line_summary')).id).toBe(updated.id)
      const history = await provider.getReportHistory(original.reportFamilyId,'driver')
      expect(history.map(r => r.id)).toEqual([original.id,simulated.id,updated.id])
      for(const report of history) { expect(DriverProjectionSchema.safeParse(report).success).toBe(true); expect(report).not.toHaveProperty('advisorNotes'); expect(report).not.toHaveProperty('preciseLocations') }
      await expect(provider.getReport('missing','driver')).rejects.toThrow()
    })
    it('reset is awaitable and allows a fresh session', async () => { const s = await provider.startSession(); await provider.reset(); const next=await provider.startSession(); expect(next.id).not.toBe(s.id) })
  })
}
providerContract('FixtureProvider', () => new FixtureProvider())
// Optional integration run against an isolated local API; each provider has its own cookie jar.
if (process.env.EV_API_TEST_URL) providerContract('ApiProvider', () => {
  let cookie = ''
  const fetcher: typeof fetch = async (url, init) => {
    const response = await fetch(url, {...init, headers:{...init?.headers, ...(cookie ? {Cookie:cookie} : {})}})
    const setCookie = response.headers.get('set-cookie'); if(setCookie) cookie = setCookie.split(';')[0]
    return response
  }
  return new ApiProvider(process.env.EV_API_TEST_URL, fetcher)
})
it('rejects invalid provider configuration', () => expect(() => createProvider('bad')).toThrow())
it('does not accept private fields in a public response', () => expect(DriverProjectionSchema.safeParse({advisorNotes:['private']} ).success).toBe(false))
it('API outage remains an error', async () => { const p=new ApiProvider('/api',async () => {throw new Error('offline')}); await expect(p.getReport('report-main','driver')).rejects.toThrow('無法連線') })
afterEach(() => vi.useRealTimers())
it('stops waiting for a stalled report request and offers a retryable error', async () => {
  vi.useFakeTimers()
  const p = new ApiProvider('/api', (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  }))
  const request = p.getReport('report-main', 'driver')
  const result = expect(request).rejects.toMatchObject({ status: 504, retryable: true })
  await vi.advanceTimersByTimeAsync(35000)
  await result
})
it('retains the same request key while a persistent evaluation is running', async () => {
  const keys: string[] = []
  const p = new ApiProvider('/api', async (_url, init) => {
    keys.push(new Headers(init?.headers).get('Idempotency-Key')!)
    return new Response(JSON.stringify({ detail: { code: 'run_in_progress', message: '評估進行中' } }), { status: 409 })
  })
  await expect(p.simulate('report-test', { type: 'home-charger-approved', value: true })).rejects.toMatchObject({ retryable: true })
  await expect(p.simulate('report-test', { type: 'home-charger-approved', value: true })).rejects.toThrow('評估進行中')
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
})
