import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type State = { sessionId: string; reportId: string; scenario: string; setContext: (value: Partial<Pick<State, 'sessionId' | 'reportId' | 'scenario'>>) => void; reset: () => void }
export const useDemoStore = create<State>()(persist((set) => ({
  sessionId: '', reportId: 'report-main', scenario: 'yellow-public',
  setContext: (value) => set(value), reset: () => set({ sessionId: '', reportId: 'report-main', scenario: 'yellow-public' }),
}), { name: `aignite-${import.meta.env.VITE_DATA_PROVIDER || 'fixture'}-v02-store` }))
