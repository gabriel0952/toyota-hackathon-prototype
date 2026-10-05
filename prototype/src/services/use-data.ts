import { useEffect, useRef, useState } from 'react'
import { dataClient } from './demo-data'
import type { ReportRole } from '../domain/contracts'
export function useData<T>(load: () => Promise<T>, key: string, poll = false, initialData?: T) {
  const loader = useRef(load); useEffect(() => { loader.current = load })
  const [state, setState] = useState<{ key: string; data?: T; error?: Error }>({ key, data: initialData })
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>, failures = 0, running = false
    const run = async () => {
      if (running || !active) return
      running = true
      try { const data = await loader.current(); if (active) setState({ key, data }); failures = 0 }
      catch (e) { if (active) setState(previous => ({ key, data: previous.key === key ? previous.data : undefined, error: e instanceof Error ? e : new Error('無法取得資料') })); failures++ }
      finally { running = false; if (active && poll) timer = setTimeout(() => { if (document.visibilityState === 'visible') void run() }, Math.min(60000, 5000 * 2 ** failures)) }
    }
    const wake = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void run() } }
    void run(); if (poll) { window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake) }
    return () => { active = false; clearTimeout(timer); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake) }
  }, [key, refresh, poll])
  return { ...(state.key === key ? state : {}), reload: () => setRefresh(v => v + 1) }
}
export const readReport = (id: string, role: ReportRole) => id.startsWith('family-') ? dataClient.getLatest(id, role) : dataClient.getReport(id, role)
