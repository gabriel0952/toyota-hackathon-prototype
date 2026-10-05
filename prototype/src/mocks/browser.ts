import { setupWorker } from 'msw/browser'

// Reserved for HTTP-shaped fixture endpoints. The current FixtureProvider is in-process,
// so the worker intentionally starts with no handlers and makes no external requests.
export const fixtureWorker = setupWorker()
