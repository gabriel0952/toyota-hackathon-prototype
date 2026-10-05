import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Native modal supplies focus containment, Escape and focus return to its trigger. */
export function ReportDetailDialog({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  return <><button type="button" className="report-detail-link" onClick={() => ref.current?.showModal()}>{label}<span aria-hidden="true"> ↗</span></button>{createPortal(<dialog ref={ref} className="report-detail-dialog" aria-labelledby={titleId}>
    <header><h2 id={titleId}>{title}</h2><button type="button" autoFocus onClick={() => ref.current?.close()} aria-label="關閉詳細資訊">關閉 ×</button></header>
    <div className="report-dialog-content">{children}</div>
  </dialog>, document.body)}</>
}
