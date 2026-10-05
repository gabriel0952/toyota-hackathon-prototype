import { ProviderError } from './provider'
import { providerMode } from './demo-data'

// The API identity cookie is per host, not per port or tab: after "登入本機展示顧問" the whole
// browser acts as the advisor, and the backend (correctly) refuses owner questionnaires.
export const isIdentityConflict = (error: unknown) => providerMode === 'api' && error instanceof ProviderError && error.status === 403
