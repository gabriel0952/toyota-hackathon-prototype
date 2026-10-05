import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, BatteryFull, CarFront, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileText, Keyboard, MapPin, Menu, MessageCircle, Search, ShieldCheck, Signal, UsersRound, Wifi, Zap } from 'lucide-react'
import { Button, Card, PathDecisionCard, Pill, ResistanceCard, SourceStatus, StatePanel, StatusBadge } from './ui'
import { readReport, useData } from '../services/use-data'
import { dataClient, providerMode } from '../services/demo-data'
import { useDemoStore } from '../store/demo-store'
import { IdentityConflictNotice } from './IdentityConflict'
import { isIdentityConflict } from '../services/identity'

const customerNames: Record<string, string> = { 'report-main': '王大明', 'report-main-v2': '林怡君', 'report-gray': '陳先生' }
export function Booking() {
  const { reportId } = useParams()
  const [params] = useSearchParams()
  const [done, setDone] = useState(false)
  const title = params.get('kind') === 'test-drive' ? '預約路線試駕' : '預約充電條件諮詢'
  return <div className="booking-page"><Link className="back" to={reportId ? `/driver/report/${reportId}` : '/driver'}><ChevronLeft/>返回{reportId ? '我的報告' : '首頁'}</Link><Card>{done ? <div className="booking-success" role="status"><CheckCircle2/><Pill>預約流程示範完成</Pill><h1>已建立你的示範預約</h1><p>正式服務會由顧問聯繫確認時段。此展示不會傳送資料或安排實際預約。</p><Link className="button primary" to={reportId ? `/driver/report/${reportId}` : '/driver'}>完成並返回</Link></div> : <><Pill>TOYOTA 轉電服務</Pill><h1>{title}</h1><p>帶著你的生活路線，和顧問一起確認下一步。</p><form onSubmit={(event) => { event.preventDefault(); setDone(true) }}><label>稱呼<input required autoComplete="name" placeholder="例如：王先生" maxLength={40}/></label><label>聯絡手機<input required type="tel" autoComplete="tel" pattern="09[0-9]{8}" title="請輸入 09 開頭的 10 碼手機號碼" placeholder="09xxxxxxxx"/></label><div className="booking-fields"><label>服務據點<select><option>台北信義營業所（示意）</option><option>台北內湖營業所（示意）</option></select></label><label>方便聯絡時段<select><option>平日 09:00–12:00</option><option>平日 13:00–18:00</option><option>週末 10:00–17:00</option></select></label></div><label className="consent"><input type="checkbox" required/><span>我同意在正式服務中，將聯絡方式與診斷摘要提供給服務顧問，以處理這次預約。</span></label><div className="info-note"><ShieldCheck/>展示模式：請使用虛構資料；輸入內容不會送出或儲存。</div><Button type="submit">確認示範預約 <ChevronRight size={16}/></Button></form></>}</Card></div>
}

// A LINE-style official-account chat: white header with verified badge, avatar + timestamps,
// Flex-style cards, quick-reply chips above the composer, and a rich menu behind「選單」.
function OaAvatar() { return <span className="lp-avatar" aria-hidden="true"><img src="/assets/toyota/logo-toyota.png" alt=""/></span> }
export function LineBot({ children, time, first = true, card = false }: { children: React.ReactNode; time?: string; first?: boolean; card?: boolean }) {
  return <div className={`lp-row bot${first ? ' first' : ''}`}>{first ? <OaAvatar/> : <span className="lp-avatar-gap"/>}<div className={card ? 'lp-card-slot' : 'lp-bubble bubble bot'}>{children}</div>{time && <time>{time}</time>}</div>
}
export function LineUser({ children, time }: { children: React.ReactNode; time: string }) {
  return <div className="lp-row user"><span className="lp-meta"><small>已讀</small><time>{time}</time></span><div className="lp-bubble bubble user">{children}</div></div>
}
export function LineFlex({ image, label, title, children, actions, className = '' }: { image?: string; label?: string; title: string; children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return <div className={`lp-flex ${className}`}>{image && <img className="lp-flex-hero" src={image} alt=""/>}<div className="lp-flex-body">{label && <span className="lp-flex-label">{label}</span>}<h3>{title}</h3>{children}</div>{actions && <div className="lp-flex-footer">{actions}</div>}</div>
}
function RichMenu({ onStart }: { onStart?: () => void }) {
  const nav = useNavigate()
  const reportId = useDemoStore(s => s.reportId)
  const hasReport = providerMode === 'fixture' || reportId.startsWith('family-')
  return <div className="lp-richmenu" aria-label="TOYOTA 轉電服務選單">
    <button onClick={() => onStart ? onStart() : nav('/driver')}><Zap aria-hidden="true"/><b>轉電診斷</b><small>3 分鐘評估</small></button>
    <button disabled={!hasReport} onClick={() => nav(`/line/result/${reportId}`)}><FileText aria-hidden="true"/><b>我的轉電報告</b><small>{hasReport ? '查看最新版本' : '完成診斷後可看'}</small></button>
    <button onClick={() => nav('/driver/booking?kind=test-drive')}><CarFront aria-hidden="true"/><b>預約試乘</b><small>bZ4X 體驗</small></button>
  </div>
}
export function LineFrame({ children, quickReplies, onStart }: { children: React.ReactNode; quickReplies?: React.ReactNode; onStart?: () => void }) {
  const chat = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(true)
  useEffect(() => { chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' }) }, [children, menuOpen])
  return <div className="phone line-phone lp">
    <div className="lp-status" aria-hidden="true"><b>9:41</b><span className="lp-island"/><span className="lp-status-icons"><Signal/><Wifi/><BatteryFull/></span></div>
    <div className="lp-header"><ChevronLeft aria-hidden="true"/><span className="lp-unread" aria-hidden="true">12</span><strong><ShieldCheck className="lp-verified" aria-label="認證官方帳號"/>TOYOTA 台灣</strong><span className="lp-header-icons" aria-hidden="true"><Search/><Menu/></span></div>
    <div className="lp-chat chat" ref={chat}>{children}</div>
    {quickReplies && <div className="lp-quick" aria-label="快速回覆">{quickReplies}</div>}
    <div className="lp-composer"><span className="lp-keyboard" aria-hidden="true"><Keyboard/></span><button aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>轉電服務選單 {menuOpen ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</button></div>
    {menuOpen && <RichMenu onStart={onStart}/>}
  </div>
}
export function LinePage() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('state')
  const [state, setState] = useState(initial || sessionStorage.getItem('ev-line-state') || 'invite')
  const [concern, setConcern] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const change = (value: string) => { setState(value); sessionStorage.setItem('ev-line-state', value); const next = new URLSearchParams(params); next.set('state', value); setParams(next, { replace: true }) }
  const [conflict, setConflict] = useState(false)
  const start = async (switchIdentity = false) => { setBusy(true); setError(''); try { if (switchIdentity) await dataClient.reset(); const session = await dataClient.startSession(); setConflict(false); useDemoStore.getState().setContext({ sessionId: session.id }); nav(`/driver/diagnostic?session=${session.id}&source=line`) } catch(e) { if (isIdentityConflict(e)) setConflict(true); else setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }
  const pickConcern = (value: string) => { setConcern(value); sessionStorage.setItem('ev-line-concern', value) }
  const inviteReplies = <><button onClick={() => change('skip')}>今天先不要</button><button onClick={() => change('stop')}>停止轉電邀請</button></>
  const quickReplies = state === 'question' && !concern
    ? <>{['充電不方便', '長途續航', '使用成本', '還不確定'].map(value => <button key={value} onClick={() => pickConcern(value)}>{value}</button>)}<button onClick={() => pickConcern('略過這題')}>略過這題</button></>
    : state === 'invite' || state === 'question' ? inviteReplies : undefined
  return <div className="line-layout authentic-line"><div className="line-copy"><Pill tone="fixture">LINE 官方帳號 · 互動展示</Pill><h1>熟悉的服務，<br/>多一個轉電選擇。</h1><p>從保養後的一則邀請開始。先聊聊你的顧慮，再到官網建立完整的生活路徑。</p><div className="line-flow-legend">{['服務邀請', '了解顧慮', '官網診斷'].map((label, i) => <span className={i === (concern ? 2 : state === 'question' ? 1 : 0) ? 'active' : ''} key={label}><b>{i + 1}</b>{label}</span>)}</div><div className="line-demo-switch" aria-label="展示情境">{[['invite', '保養後邀請'], ['skip', '今天略過'], ['stop', '停止邀請']].map(([value, label]) => <button aria-pressed={state === value} key={value} onClick={() => { setConcern(''); change(value) }}>{label}</button>)}</div>{conflict && <IdentityConflictNotice busy={busy} onSwitch={() => start(true)}/>}<p role="alert">{error}</p><p className="line-explainer">這是網頁中的 LINE 對話模擬，所有服務與通知均為示意。</p></div>
    <LineFrame quickReplies={quickReplies} onStart={() => start()}>
      <div className="lp-date date">今天</div>
      <LineBot time="下午2:32"><p>王先生您好，您的 RAV4 保養已完成，謝謝您回廠！</p></LineBot>
      {state === 'stop' ? <>
        <LineUser time="下午2:35">停止轉電邀請</LineUser>
        <LineBot time="下午2:35"><div role="status"><p>已停止主動轉電邀請。保養與原廠服務通知不受影響。</p><p>之後想了解時，仍可從下方選單自行開啟轉電診斷。</p></div></LineBot>
        <LineBot first={false} card><LineFlex title="想再收到轉電資訊嗎？" actions={<button className="lp-flex-link" onClick={() => change('invite')}>重新開啟轉電邀請</button>}/></LineBot>
      </> : state === 'skip' ? <>
        <LineUser time="下午2:35">今天先不要</LineUser>
        <LineBot time="下午2:35"><p role="status">沒問題，今天不再繼續這次邀請。有需要時再回來就好。</p></LineBot>
        <LineBot first={false} card><LineFlex title="之後的轉電邀請" actions={<><button className="lp-flex-link" onClick={() => change('invite')}>返回服務邀請</button><button className="lp-flex-link muted" onClick={() => change('stop')}>停止未來的轉電邀請</button></>}/></LineBot>
      </> : <>
        <LineBot first={false} card time="下午2:32"><LineFlex image="/assets/toyota/bz4x-driving.jpg" label="給車主的轉電評估" title="你的生活，適合換電動車嗎？" actions={<><button className="lp-flex-primary line-primary" onClick={() => change('question')}>先聊聊我的顧慮</button><button className="lp-flex-link" disabled={busy} onClick={() => start()}>{busy ? '正在開啟…' : '開始轉電診斷'}</button></>}><p>能不能充、敢不敢跑、值不值得換，用你的生活條件找答案。</p></LineFlex></LineBot>
        {state === 'question' && <>
          <LineUser time="下午2:33">先聊聊我的顧慮</LineUser>
          <LineBot time="下午2:33"><p>您目前最在意電動車的哪件事？選一項就好，也可以直接略過。</p></LineBot>
          {concern && <>
            <LineUser time="下午2:34">{concern}</LineUser>
            <LineBot time="下午2:34"><p>{concern === '使用成本' ? '了解，診斷會一起比較你目前的油資和轉電後的能源支出。' : concern === '長途續航' ? '了解，我們會把最長行程和中途補電安排一起納入評估。' : '了解，接下來用你的停車與行程條件，找出適合的補電路徑。'}</p></LineBot>
            <LineBot first={false} card><LineFlex className="line-action-card" label="約 3 分鐘 · 不需精確地址" title="到 TOYOTA 官網完成診斷" actions={<button className="lp-flex-primary" disabled={busy} onClick={() => start()}>{busy ? '正在開啟…' : '開始轉電診斷'}<ArrowUpRight size={16}/></button>}/></LineBot>
          </>}
        </>}
      </>}
    </LineFrame></div>
}


function AdvisorError({ error, retry }: { error: Error; retry: () => void }) {
  const [message, setMessage] = useState('');
  return <Card><h2>無法開啟顧問資料</h2><p role="alert">{error.message}</p><p>本機測試請以另一個瀏覽器工作階段登入顧問，並由車主授權分享。</p><Button onClick={() => { void dataClient.loginAdvisor().then(retry).catch(e => setMessage(String(e))) }}>登入本機展示顧問</Button><Button variant="secondary" onClick={retry}>重新載入</Button><p role="status">{message}</p></Card>
}
export function AdvisorList() {
  const loaded = useData(() => dataClient.listReports(), 'advisor-list', true);
  const [filter, setFilter] = useState('all'); const [search, setSearch] = useState('');
  if (loaded.error) return <AdvisorError error={loaded.error} retry={loaded.reload}/>;
  if (!loaded.data) return <StatePanel kind="loading"/>;
  const visible = loaded.data.filter(r => (filter === 'all' || (r.path || 'pending') === filter) && `${customerNames[r.id] || '車主'} ${r.vehicle}`.includes(search));
  return <div className="advisor-page"><div className="advisor-title"><div><div className="eyebrow">CUSTOMER WORKSPACE</div><h1>我的潛在客戶</h1><p>車主授權的最新正式報告，條件更新後同步顯示。</p></div><Pill>{loaded.data.length} 份報告</Pill></div><Card className="lead-table"><div className="advisor-list-tools"><label>搜尋服務名單<input aria-label="搜尋服務名單" value={search} onChange={e => setSearch(e.target.value)}/></label><div className="filter-buttons">{[['all','全部'],['yellow','路徑可行'],['green','條件成熟'],['gray','暫緩'],['pending','資料待確認']].map(([value,label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="advisor-table-labels" aria-hidden="true"><span>車主與車輛</span><span>評估狀態</span><span>優先確認</span><span>版本與下一步</span><span/></div>{visible.map(r => <Link className="lead-row" to={`/advisor/reports/${r.reportFamilyId}`} key={r.id}><span><b>{customerNames[r.id] || '車主'}</b><small>{r.vehicle}</small></span><StatusBadge path={r.path}/><span>{r.resistances[0]?.title}</span><span>v{r.version} · {r.nextActions[0]?.label}</span><ChevronRight/></Link>)}{!visible.length && <p className="empty-leads">目前沒有符合條件的授權報告。</p>}</Card></div>
}
export function AdvisorDetail() {
  const { reportId = '' } = useParams(); const nav = useNavigate();
  const loaded = useData(() => readReport(reportId, 'advisor'), reportId, reportId.startsWith('family-'));
  const [check, setCheck] = useState(false), [busy, setBusy] = useState(false), [note, setNote] = useState(''), [message, setMessage] = useState('');
  if (loaded.error) return <AdvisorError error={loaded.error} retry={loaded.reload}/>;
  if (!loaded.data) return <StatePanel kind="loading"/>;
  const report = loaded.data;
  const confirm = async () => { setBusy(true); try { const updated = await dataClient.updateConfirmedCondition(report.id, { type:'home-charger-approved', value:true }); setMessage(`已建立正式報告 v${updated.version}，原版仍保留。`); setCheck(false); nav(`/advisor/reports/${updated.reportFamilyId}`); loaded.reload() } catch(e) { setMessage(String(e)) } finally { setBusy(false) } };
  const saveNote = async () => { try { await dataClient.saveAdvisorNote(report.reportFamilyId, note); setMessage('顧問紀錄已儲存'); loaded.reload() } catch(e) { setMessage(String(e)) } };
  return <div className="advisor-page"><Link className="back" to="/advisor"><ChevronLeft/>返回名單</Link><div className="advisor-detail-head"><h1>{customerNames[report.id] || '車主'} · {report.vehicle} 的轉電條件</h1><p>正式報告 v{report.version} · 填答版本 {report.inputRevision}</p></div><div className="advisor-decision"><PathDecisionCard report={report}/></div>{message && <p className="advisor-feedback" role="status">{message}</p>}<div className="advisor-grid"><div className="advisor-main-column"><div className="resistance-list">{report.resistances.map(r => <ResistanceCard key={r.id} item={r}/>)}</div><Card><h3><MapPin/>區域與變更摘要</h3><p>{report.blurredLocations.join('、')}</p>{report.changeSummary.map(c => <p key={c}>{c}</p>)}</Card><Card><h3><FileText/>服務紀錄（僅顧問可見）</h3>{'advisorNotes' in report && report.advisorNotes.map((n,i) => <p key={i}>{n}</p>)}<label className="note-label">新增紀錄<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)}/></label><div className="note-actions"><Button disabled={!note.trim()} onClick={saveNote}>儲存紀錄</Button></div></Card></div><aside><Card><h3><ShieldCheck/>確認實際改善條件</h3>{report.pendingConfirmations.map(p => <p key={p}>{p}</p>)}<label className="consent"><input type="checkbox" checked={check} onChange={e => setCheck(e.target.checked)}/><span>已確認住家充電實際可用</span></label><Button disabled={!check || busy} onClick={confirm}>{busy ? '重新評估中…' : '更新條件並重新評估'}</Button><small>只更新已確認條件，仍須通過行程等檢查，結果不保證轉綠。</small></Card>{'suggestedQuestions' in report && report.suggestedQuestions.length > 0 && <Card className="advisor-questions"><h3><MessageCircle/>建議追問</h3><ol>{report.suggestedQuestions.map(q => <li key={q}>{q}</li>)}</ol><small>聯繫前先問清楚，避免重複詢問車主。</small></Card>}<Card><h3><UsersRound/>建議下一步</h3>{report.nextActions.map(a => <p key={a.label}>{a.label}</p>)}</Card><SourceStatus sources={report.sources} generationMode={report.contractVersion === '0.3' ? report.generationMode : undefined}/></aside></div></div>
}
