import { FixtureProvider } from './fixture-provider'
import { ApiProvider } from './api-provider'
import type { DemoDataProvider } from './provider'
export { FixtureProvider, ApiProvider }
export { questions } from './questions'
export type { DemoDataProvider } from './provider'
export const CONTRACT_VERSION = '0.2'
export const providerMode = import.meta.env.VITE_DATA_PROVIDER || 'fixture'
export function createProvider(mode: string): DemoDataProvider {
  if (mode === 'fixture') return new FixtureProvider(typeof localStorage === 'undefined' ? undefined : localStorage)
  if (mode === 'api') return new ApiProvider(import.meta.env.VITE_API_BASE_URL || '/api/v1')
  throw new Error(`不支援的資料模式：${mode}`)
}
export const dataClient: DemoDataProvider = new Proxy({} as DemoDataProvider, {
  get(_target, name) { return (...args: unknown[]) => { try { const provider = getProvider(); return Reflect.apply(Reflect.get(provider, name), provider, args) } catch(e) { return Promise.reject(e) } } },
})
let singleton: DemoDataProvider | undefined
function getProvider() { return singleton ??= createProvider(providerMode) }
