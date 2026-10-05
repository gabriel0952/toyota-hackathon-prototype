import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { DriverProjection } from '../domain/contracts'
import { dataClient } from '../services/demo-data'
import { useData } from '../services/use-data'
import { ReportDetailDialog } from './ReportDetailDialog'
import { Button, Card } from './ui'
export function ReportControls({ report }: { report: DriverProjection }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const evaluation = useData(() => dataClient.getEvaluationState(report.reportFamilyId), report.reportFamilyId, true)
  const history = useData(() => dataClient.getReportHistory(report.reportFamilyId, 'driver'), report.reportFamilyId + report.id)
  const share = async (on: boolean) => { setBusy(true); try { await dataClient.setShare(report.reportFamilyId, on); setMessage(on ? '已同意分享給示範顧問' : '已撤銷顧問分享') } catch (e) { setMessage(String(e)) } finally { setBusy(false) } }
  return <Card className="report-controls">
    {evaluation.data?.pending && <p className="report-controls-pending" role="status">已收到填答版本 {evaluation.data.inputRevision}，尚未成功評估；目前保留舊報告。請重試原操作或返回表單確認。</p>}
    <div className="report-version"><h3>{report.kind === 'simulation' ? '假設模擬・未改變正式報告' : '正式評估版本'} v{report.version}</h3><p>{report.changeSummary.join('；') || '初次建立的條件評估'}</p><Link className="report-text-link" to={`/driver/report/${report.reportFamilyId}`}>查看最新正式報告</Link>
      <ReportDetailDialog title="歷史報告版本" label="查看歷史紀錄">{history.error && <p role="alert">{history.error.message}</p>}{history.data?.map(r => <p key={r.id}><Link className="report-text-link" to={`/driver/report/${r.id}`}>v{r.version}・{r.kind === 'simulation' ? '假設模擬' : '正式評估'}</Link></p>)}</ReportDetailDialog>
    </div>
    <div className="report-sharing"><h3>與顧問一起討論下一步</h3><p>同意分享後，示範顧問可查看這份報告與後續版本。</p><div className="actions"><Button disabled={busy} onClick={() => share(true)}>同意分享給示範顧問</Button><Button disabled={busy} variant="quiet" onClick={() => share(false)}>撤銷分享</Button></div>{message && <small role="status">{message}</small>}</div>
  </Card>
}
