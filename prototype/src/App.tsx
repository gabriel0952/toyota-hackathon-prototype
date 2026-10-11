import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BatteryCharging, CarFront, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, MapPin, MessageCircle, Route as RouteIcon, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { Button, Card, NextActions, PathDecisionCard, Pill, SourceStatus, StatePanel, StatusBadge, Tabs } from './components/ui'
import { formAnswer } from './domain/answers'
import { readReport, useData } from './services/use-data'
import { ReportDetailDialog } from './components/ReportDetailDialog'
import { ReportControls } from './components/ReportControls'
import { IdentityConflictNotice } from './components/IdentityConflict'
import { isIdentityConflict } from './services/identity'
import type { DriverProjection } from './domain/contracts'
import { dataClient, questions, providerMode } from './services/demo-data'
import { useDemoStore } from './store/demo-store'
import { ParkingFields, JourneyFields, CostFields } from './components/DiagnosticFields'
import { CDP_DATABASE, estimateTradeInValue, findVehiclePreset } from './domain/vehicle-presets'
import { AdvisorDetail, AdvisorList, Booking, LineBot, LineFrame, LinePage } from './components/ServiceExperience'


function ToyotaMark() { return <span className="toyota-mark"><img src="/assets/toyota/logo-toyota.png" alt="TOYOTA" width="174" height="32"/></span> }
function ToyotaHeader() { const currentReport = useDemoStore(s => s.reportId); const [open, setOpen] = useState(false); return <header className="toyota-header"><Link to="/driver" aria-label="TOYOTA 轉電服務首頁"><ToyotaMark/></Link><button className="mobile-menu" aria-expanded={open} onClick={() => setOpen(!open)}>選單</button><nav className={open ? 'open' : ''} aria-label="車主服務">{[['/driver', '轉電生活'], ['/driver/diagnostic', '適合我的轉電路徑'], ...(providerMode === 'fixture' ? [['/driver/report/report-main', '報告示範']] : currentReport.startsWith('family-') ? [[`/driver/report/${currentReport}`, '我的報告']] : []), ['/line', 'LINE 服務']].map(([to, label]) => <Link to={to} key={to} onClick={() => setOpen(false)}>{label}</Link>)}</nav><Link className="button primary header-booking" to="/driver/booking?kind=test-drive">預約試乘</Link></header> }
function AdvisorSidebar() { const location = useLocation(); return <aside className="advisor-sidebar"><Link to="/advisor"><ToyotaMark/></Link><strong className="sidebar-title">業務顧問後台</strong><nav><Link className={location.pathname === '/advisor' ? 'active' : ''} to="/advisor"><UsersRound/>我的潛在客戶</Link><Link className={location.pathname.includes('/reports/') ? 'active' : ''} to="/advisor"><RouteIcon/>轉電診斷報告</Link></nav><div className="sidebar-bottom"><Pill tone="fixture">顧問工作區示範</Pill><Link to="/driver"><ChevronLeft/>返回車主網站</Link></div></aside> }
function AdvisorHeader() { return <header className="advisor-header"><span className="workspace-label">TOYOTA <span>/</span> 轉電服務工作區</span><span className="advisor-avatar">陳</span><div><b>陳顧問</b><small>台北信義營業所 · 展示帳號</small></div></header> }
function DemoPanel({ present, reset }: { present: boolean; reset: () => void }) { return !present && import.meta.env.DEV && providerMode === 'fixture' ? <details className="dev-panel"><summary>Demo 控制</summary><Link to="/driver/report/report-main?scenario=yellow-public">黃色</Link><Link to="/driver/report/report-main-v2?scenario=after-home-install">綠色</Link><Link to="/driver/report/report-gray?scenario=gray">灰色</Link><button onClick={() => { void dataClient.reset().then(() => { reset(); window.location.assign('/line') }); Object.keys(sessionStorage).filter((key) => key.startsWith('ev-')).forEach((key) => sessionStorage.removeItem(key)); }}>重設</button></details> : null }
function Shell() {
  const location = useLocation(); const [params] = useSearchParams(); const queryPresent = params.get('present') === '1'; const [present] = useState(() => queryPresent || sessionStorage.getItem('aignite-present') === '1'); useEffect(() => { if (queryPresent) sessionStorage.setItem('aignite-present', '1') }, [queryPresent]); const reset = useDemoStore((state) => state.reset); const nav = location.pathname.startsWith('/advisor') ? 'advisor' : location.pathname.startsWith('/line') ? 'line' : 'driver'
  if (nav === 'advisor') return <div className="advisor-app"><AdvisorSidebar/><div className="advisor-workspace"><AdvisorHeader/><main><Outlet/></main></div><DemoPanel present={present} reset={reset}/></div>
  if (nav === 'line') return <div className="app line"><header className="line-demo-header"><ToyotaMark/><div><b>LINE「TOYOTA 電到你」</b><small>保養後低打擾服務流程</small></div><Pill>LINE 官方帳號 TOYOTA 台灣</Pill></header><main><Outlet/></main><DemoPanel present={present} reset={reset}/></div>
  return <div className="app driver"><ToyotaHeader/><main><Outlet/></main><DemoPanel present={present} reset={reset}/></div>
}

function DriverLanding() { const [error, setError] = useState(''); const [conflict, setConflict] = useState(false); const [busy, setBusy] = useState(false); const navigate = useNavigate(); const setContext = useDemoStore((s) => s.setContext); const begin = async (switchIdentity = false) => { setBusy(true); setError(''); try { if (switchIdentity) await dataClient.reset(); const s = await dataClient.startSession(); setConflict(false); setContext({ sessionId: s.id }); sessionStorage.removeItem(`ev-${providerMode}-v02-draft`); navigate(`/driver/diagnostic?session=${s.id}`) } catch(e) { if (isIdentityConflict(e)) setConflict(true); else setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }; return <div className="landing"><div className="hero-copy"><h1>下一台車，<br/>會讓你<em>心動</em>嗎？</h1><p>從生活習慣到充電需求，分析你的日常通勤、停車與行程，找到最適合你的電動生活。</p><div className="hero-questions"><span><BatteryCharging/><b>能不能充？</b><small>生活圈充電條件分析</small></span><span><RouteIcon/><b>敢不敢跑？</b><small>日常用能與行程評估</small></span><span><CircleDollarSign/><b>值不值得換？</b><small>使用成本與效益評估</small></span></div>{conflict && <IdentityConflictNotice busy={busy} onSwitch={() => begin(true)}/>}<p role="alert">{error}</p><Button disabled={busy} onClick={() => begin()}>開始轉電診斷 <ChevronRight size={18}/></Button><small className="fine">約 3 分鐘 · 不需精確地址 · 可隨時修改</small></div><div className="path-visual" aria-hidden="true"><span className="official-photo-credit">bZ4X · TOYOTA 台灣官網車圖</span></div></div> }

const diagnosticStages = [
  { number: 1, label: '用車狀況', icon: CarFront },
  { number: 2, label: '停車與充電', icon: MapPin },
  { number: 3, label: '行程需求', icon: RouteIcon },
  { number: 4, label: '能源花費', icon: CircleDollarSign },
  { number: 5, label: '分析結果', icon: Sparkles },
]

function DiagnosticStepper({ active }: { active: number }) {
  return <div className="diagnostic-stepper" aria-label={`轉電診斷進度，目前第 ${active} 步`}>
    <div className="step-track"><span style={{ width: `${((active - 1) / 4) * 100}%` }}/></div>
    {diagnosticStages.map(({ number, label }) => <div className={`diagnostic-step ${number < active ? 'complete' : ''} ${number === active ? 'active' : ''}`} key={number}>
      <span>{number < active ? '✓' : String(number).padStart(2, '0')}</span><small>{label}</small>
    </div>)}
  </div>
}

function DriverDiagnostic() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const stored = useDemoStore()
  const requestedStep = Number(params.get('step') || 1)
  const initialStep = Number.isFinite(requestedStep) ? Math.min(questions.length, Math.max(1, Math.floor(requestedStep))) : 1
  const [index, setIndex] = useState(initialStep - 1)
  const draftKey = `ev-${providerMode}-v02-draft-${params.get('session') || stored.sessionId || 'new'}`
  const [answers, setAnswers] = useState<Record<string, string | number>>(() => { const defaults = {
    vehicle: 'TOYOTA RAV4 2018', vehicleType: '汽油車', locations: '已設定三個生活錨點',
    distance: 18, longDistance: '', tripFrequency: '每月 1–2 次', chargingStop: '',
    parking: 'unknown', noWork: 0, noCommute: 0, unknownCost: 0, unknownMileage: 0, charging: '每月 NT$ 3,000–5,000', monthlyCost: 4800, monthlyMileage: 1200, ownershipYears: 7, vehicleAge: 8, fuelEfficiencyKmPerL: '', homeChargingPercent: '', estimatedTradeInValue: '', plannedOwnershipYears: '', homeChargerCost: '', replacementVehicle: '', home: '', work: '', leisure: '', chargingMethod: '公司周邊公共充電',
  }; try { return { ...defaults, ...JSON.parse(sessionStorage.getItem(draftKey) || '{}') } } catch { return defaults } })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [identityConflict, setIdentityConflict] = useState(false)
  useEffect(() => { sessionStorage.setItem(draftKey, JSON.stringify(answers)) }, [answers, draftKey])
  useEffect(() => { setIndex(initialStep - 1) }, [initialStep])
  const q = questions[index]
  const inRange = (key: string, max: number) => answers[key] !== '' && Number.isFinite(Number(answers[key])) && Number(answers[key]) >= 0 && Number(answers[key]) <= max
  const optionalRange = (key: string, max: number) => answers[key] === '' || inRange(key, max)
  const invalid = q.id === 'vehicle' ? !String(answers.vehicle).trim() || !inRange('ownershipYears', 50) || !inRange('vehicleAge', 50) : q.id === 'locations' ? !String(answers.chargingMethod).trim() : q.id === 'distance' ? (answers.noCommute !== 1 && !inRange('distance', 150)) : (answers.unknownCost !== 1 && !inRange('monthlyCost', 30000)) || (answers.unknownMileage !== 1 && !inRange('monthlyMileage', 10000)) || !optionalRange('fuelEfficiencyKmPerL', 50) || !optionalRange('homeChargingPercent', 100) || !optionalRange('estimatedTradeInValue', 5000000) || !optionalRange('plannedOwnershipYears', 10) || (answers.plannedOwnershipYears !== '' && Number(answers.plannedOwnershipYears) < 1) || !optionalRange('homeChargerCost', 1000000)
  const sessionId = params.get('session') || stored.sessionId
  useEffect(() => {
    if (!params.get('edit') || !sessionId) return
    let active = true
    dataClient.getSession(sessionId).then(s => { if (active) setAnswers(previous => ({ ...previous, unknownCost: s.fields.monthlyCost?.status === 'unknown' ? 1 : 0, unknownMileage: s.fields.monthlyMileage?.status === 'unknown' ? 1 : 0, noCommute: s.fields.distance?.status === 'not_applicable' ? 1 : 0, ...Object.fromEntries(Object.entries(s.fields).map(([k,v]) => [k, v.value === null ? '' : typeof v.value === 'boolean' ? Number(v.value) : v.value])) })) }).catch(e => setSaveError(String(e)))
    return () => { active = false }
  }, [sessionId, params.get('edit')])
  const setAnswer = (key: string, value: string | number) => setAnswers((current) => ({ ...current, [key]: value }))
  const findVehiclePresetKey = (vehicle: unknown) => Object.keys(CDP_DATABASE).find(key => CDP_DATABASE[key] === findVehiclePreset(vehicle)) ?? ''
  const pickPreset = (key: string) => {
    const car = CDP_DATABASE[key]
    if (!car) return
    const tradeIn = estimateTradeInValue(car.newPrice, answers.vehicleAge)
    setAnswers(current => ({ ...current, vehicle: car.name, vehicleType: car.vehicleType, fuelEfficiencyKmPerL: car.fuelEco, ...(tradeIn != null && { estimatedTradeInValue: tradeIn }) }))
  }
  const goToStep = (nextIndex: number) => {
    const safeIndex = Math.min(questions.length - 1, Math.max(0, nextIndex))
    setIndex(safeIndex)
    const nextParams = new URLSearchParams(params)
    nextParams.set('step', String(safeIndex + 1))
    setParams(nextParams, { replace: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => document.getElementById('question-title')?.focus({ preventScroll: true }))
  }
  const next = async () => {
    if (invalid || saving) return
    setSaving(true); setSaveError('')
    try {
      let activeSession = sessionId
      if (!activeSession) { const created = await dataClient.startSession(); activeSession = created.id; stored.setContext({ sessionId: activeSession }) }
      await dataClient.saveAnswer(activeSession, formAnswer(q.id, answers))
      stored.setContext({ sessionId: activeSession })
      if (index < questions.length - 1) goToStep(index + 1)
      else nav(`/driver/analysis?session=${activeSession}`)
    } catch (e) { if (isIdentityConflict(e)) setIdentityConflict(true); else setSaveError('暫時無法儲存，請再試一次。你的填答仍保留在此頁。') }
    finally { setSaving(false) }
  }
  // Log the browser out of the advisor identity, then replay this tab's answers into a fresh owner session.
  const switchToDriver = async () => {
    setSaving(true); setSaveError('')
    try {
      await dataClient.reset()
      const created = await dataClient.startSession()
      for (const answered of questions.slice(0, index + 1)) await dataClient.saveAnswer(created.id, formAnswer(answered.id, answers))
      stored.setContext({ sessionId: created.id }); setIdentityConflict(false)
      if (index === questions.length - 1) { nav(`/driver/analysis?session=${created.id}`); return }
      const nextParams = new URLSearchParams(params); nextParams.set('session', created.id); nextParams.delete('edit'); nextParams.set('step', String(index + 2))
      setParams(nextParams, { replace: true }); setIndex(index + 1); window.scrollTo({ top: 0, behavior: 'instant' })
    } catch { setSaveError('切換身分失敗，請確認後端服務後再試一次。你的填答仍保留在此頁。') }
    finally { setSaving(false) }
  }


  return <div className={`diagnostic page-narrow stage-${q.id}`}>
    <DiagnosticStepper active={index + 1}/>
    <Card className="question diagnostic-question">
      <header><span className="question-count">第 {index + 1} 題，共 {questions.length} 題</span><span>約 3 分鐘 · 位置只需約略區域</span></header>
      <h1 tabIndex={-1} id="question-title">{q.title}</h1><p className="question-hint">{q.hint}</p>

      {q.id === 'vehicle' && <div className="vehicle-step-content">
        <div className="vehicle-options-panel">
          <div className="vehicle-choice-grid">{['汽油車', '油電車', '柴油車', '其他'].map((type, itemIndex) => <button key={type} aria-pressed={answers.vehicleType === type || (answers.vehicleType === '油電混合車' && type === '油電車') || (answers.vehicleType === '其他車型' && type === '其他')} className={(answers.vehicleType === type || (answers.vehicleType === '油電混合車' && type === '油電車') || (answers.vehicleType === '其他車型' && type === '其他')) ? 'selected' : ''} onClick={() => { setAnswer('vehicleType', type); if (type === '其他') document.getElementById('vehicle-model')?.focus() }}>
            <span className={`vehicle-silhouette v${itemIndex + 1}`}>{itemIndex === 3 ? <i>•••</i> : <img src={['/assets/toyota/yaris-cross.png', '/assets/toyota/rav4-adventure.png', '/assets/toyota/hilux.png'][itemIndex]} alt="" width="540" height="187"/>}</span><b>{type}</b><small>{['一般加油的燃油車', '油電混合（HEV）', '柴油引擎車款', '手動輸入（插電式或不確定）'][itemIndex]}</small>
          </button>)}</div>
          <label className="vehicle-quick-pick">常見車型快速帶入<small>選擇後會自動帶入車款、燃料類型、平均油耗與估算換購價，仍可手動修改。</small>
            <select value={findVehiclePresetKey(answers.vehicle)} onChange={(event) => pickPreset(event.target.value)}>
              <option value="">不在清單中，手動填寫</option>
              {Object.entries(CDP_DATABASE).map(([key, item]) => <option key={key} value={key}>{item.name}</option>)}
            </select>
          </label>
          <div className="vehicle-detail-row"><label>目前車款<input id="vehicle-model" placeholder="例如：TOYOTA RAV4 2018" value={answers.vehicle} onChange={(event) => setAnswer('vehicle', event.target.value)}/></label><label>這台車開了幾年<input type="number" min="0" max="50" value={answers.ownershipYears} onChange={(event) => setAnswer('ownershipYears', event.target.value)}/></label><label>車齡（出廠至今）<input type="number" min="0" max="50" value={answers.vehicleAge} onChange={(event) => setAnswer('vehicleAge', event.target.value)}/></label></div>
          <p className="vehicle-detail-hint">二手購入的車，車齡會比開的年數長；不確定填大約即可。車款與年份可到行照上查看。</p>
        </div>
      </div>}

      {q.id === 'locations' && <ParkingFields answers={answers} setAnswer={setAnswer}/>}
      {q.id === 'distance' && <JourneyFields answers={answers} setAnswer={setAnswer}/>}
      {q.id === 'charging' && <CostFields answers={answers} setAnswer={setAnswer}/>}

      </Card>
      {identityConflict && <IdentityConflictNotice busy={saving} onSwitch={switchToDriver}/>}
      <footer className="question-navigation">{saveError && <p role="alert">{saveError}</p>}<button className="diagnostic-back" disabled={saving} onClick={() => index ? goToStep(index - 1) : nav('/driver')}><ChevronLeft/>上一步</button><div><small role="status">{invalid ? '請補上必填內容，或選擇不確定／不適用。' : '填答已暫存在此分頁，可隨時返回修改'}</small><Button disabled={saving || invalid} onClick={next}>{saving ? '儲存中…' : ['下一步：停車與充電', '下一步：行程需求', '下一步：能源花費', '建立我的轉電路徑'][index]}<ChevronRight size={18}/></Button></div></footer>
  </div>
}

function Analysis() {
  const nav = useNavigate(); const [params] = useSearchParams(); const stored = useDemoStore();
  const sessionId = params.get('session') || stored.sessionId;
  const loaded = useData(() => dataClient.evaluate(sessionId), sessionId);
  useEffect(() => { if (loaded.data) { stored.setContext({ reportId: loaded.data.reportFamilyId }); nav(`/driver/report/${loaded.data.reportFamilyId}`, { replace: true, state: { report: loaded.data } }) } }, [loaded.data, nav]);
  return <div className="analysis-page"><DiagnosticStepper active={5}/>{loaded.error ? <><StatePanel kind="error" onReset={loaded.reload}/><p role="alert">{loaded.error.message}</p></> : <><StatePanel kind="loading"/><p>{providerMode === 'api' ? '依填答、官方車規與已核對的充電快取資料評估；結果會標示資料來源與更新時間。' : '目前為固定情境展示。'}</p></>}</div>
}

function MapGraphic() { return <div className="map report-real-map"><img src="/assets/taipei-osm-map.png" alt="OpenStreetMap 台北都會區充電備援路徑"/><svg viewBox="0 0 700 390" role="img" aria-label="Demo 充電路徑疊加層"><path className="route-overlay" d="M92 306 C172 250 216 232 286 190 S430 146 520 102 S604 92 654 56"/>{[[92,306,'住家'],[286,190,'公司'],[520,102,'Plan A'],[654,56,'Plan C']].map(([x,y,l]) => <g key={l as string} transform={`translate(${x} ${y})`}><circle r="15"/><text y="-23">{l}</text></g>)}</svg><span className="map-label">© OpenStreetMap contributors・站點為 Demo 約略位置</span></div> }
type TcoAnalysis = NonNullable<DriverProjection['tcoAnalysis']>
const money = (value: number) => `NT$ ${Math.round(value).toLocaleString('zh-TW')}`
const signedMoney = (value: number) => `${value >= 0 ? '省下' : '多支出'} ${money(Math.abs(value))}`
function payback(value: number | null | undefined) { if (value == null) return '10 年內未交叉'; if (value === 0) return '起始即較低'; const totalMonths=Math.round(value*12),years=Math.floor(totalMonths/12),months=totalMonths%12; return years ? `約 ${years} 年${months ? ` ${months} 個月` : ''}` : `約 ${months} 個月` }
function TcoCurveChart({ tco }: { tco: TcoAnalysis }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(920)
  useEffect(() => {
    const element = chartRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.max(280, entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [tco.curves])
  if (!tco.curves) return null
  const { years,current,newIce,bz4x }=tco.curves, width=chartWidth,height=330,left=52,right=22,top=24,bottom=52
  const max=Math.max(...current,...newIce,...bz4x,1)*1.08, x=(i:number)=>left+i*(width-left-right)/Math.max(1,years.length-1), y=(v:number)=>top+(max-v)*(height-top-bottom)/max
  const points=(series:number[])=>series.map((v,i)=>`${x(i)},${y(v)}`).join(' ')
  const lines=[{key:'current',label:'繼續開現有車',values:current,color:'#7a8796',dash:'none',width:3},{key:'new',label:`換購 ${tco.comparisonVehicle || '全新油車'}`,values:newIce,color:'#b47700',dash:'10 7',width:3},{key:'ev',label:'換購 bZ4X',values:bz4x,color:'#d71920',dash:'none',width:5}]
  return <Card className="tco-chart-card"><div className="tco-card-heading"><div><Pill>10 年趨勢</Pill><h3>累積持有成本交叉曲線</h3></div><div className="tco-legend" aria-label="曲線圖例">{lines.map(line=><span key={line.key}><i className={line.key} style={{borderColor:line.color}}/>{line.label}</span>)}</div></div><div className="tco-chart-scroll" ref={chartRef}><svg className="tco-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="tco-chart-title tco-chart-desc"><title id="tco-chart-title">十年累積持有成本比較</title><desc id="tco-chart-desc">比較繼續使用現有車、換購全新油車與換購 bZ4X 的累積情境成本。</desc>{[0,.25,.5,.75,1].map(ratio=>{const value=max*ratio,yy=y(value);return <g key={ratio}><line x1={left} x2={width-right} y1={yy} y2={yy} className="tco-grid"/><text x={left-12} y={yy+4} textAnchor="end">{`${Math.round(value/10000)}萬`}</text></g>})}{years.map((year,index)=><g key={year}><line x1={x(index)} x2={x(index)} y1={top} y2={height-bottom} className="tco-grid vertical"/>{(chartWidth > 600 || index % 2 === 0 || index === years.length - 1) && <text x={x(index)} y={height-22} textAnchor="middle">{year}年</text>}</g>)}{lines.map(line=><polyline key={line.key} points={points(line.values)} fill="none" stroke={line.color} strokeWidth={line.width} strokeDasharray={line.dash} strokeLinecap="round" strokeLinejoin="round"/>)}</svg></div><ReportDetailDialog title="十年累積成本數值" label="查看逐年數值"><p className="table-scroll-hint">左右滑動可查看完整比較</p><div className="table-scroll" tabIndex={0} role="region" aria-label="成本比較表，可左右捲動"><table><thead><tr><th>年度</th><th>現有車</th><th>全新油車</th><th>bZ4X</th></tr></thead><tbody>{years.map((year,index)=><tr key={year}><th>{year} 年</th><td>{money(current[index])}</td><td>{money(newIce[index])}</td><td>{money(bz4x[index])}</td></tr>)}</tbody></table></div></ReportDetailDialog></Card>
}
function TcoBreakdown({ tco }: { tco: TcoAnalysis }) {
  if (!tco.fiveYearBreakdown) return null
  const rows=[['purchase','換購淨支出'],['energy','油／電能源費'],['maintenance','保養維修'],['tax','稅費']] as const, cols=[{key:'current',label:'繼續開現有車'},{key:'newIce',label:`換購 ${tco.comparisonVehicle || '全新油車'}`},{key:'bz4x',label:'換購 bZ4X'}] as const
  return <Card className="tco-breakdown"><div className="tco-card-heading"><div><Pill>五年比較</Pill><h3>營運總成本三方細目</h3></div><small>正值為情境支出；未扣除期末殘值</small></div><p className="table-scroll-hint">左右滑動可查看完整比較</p><div className="table-scroll" tabIndex={0} role="region" aria-label="成本比較表，可左右捲動"><table><thead><tr><th>成本項目</th>{cols.map(col=><th key={col.key}>{col.label}</th>)}</tr></thead><tbody>{rows.map(([key,label])=><tr key={key}><th>{label}</th>{cols.map(col=><td key={col.key}>{money(tco.fiveYearBreakdown?.[col.key]?.[key] || 0)}</td>)}</tr>)}<tr className="tco-total"><th>五年累積</th>{cols.map(col=>{const values=tco.fiveYearBreakdown?.[col.key];return <td key={col.key}>{money(values ? Object.values(values).reduce((sum,value)=>sum+value,0):0)}</td>})}</tr></tbody></table></div></Card>
}
function CostReport({ report, editUrl }: { report: DriverProjection; editUrl: string }) {
  const [comparison, setComparison] = useState<'new' | 'keep'>('new')
  const [view, setView] = useState<'trend' | 'breakdown'>('trend')
  const tco = report.tcoAnalysis
  const difference = comparison === 'new' ? tco?.fiveYearSavingsVsNewIce : tco?.fiveYearSavingsVsKeep
  const crossing = comparison === 'new' ? tco?.breakEvenVsNewIceYears : tco?.breakEvenVsKeepYears
  const comparedTo = tco?.comparisonVehicle || '全新油車'
  const evMonthly = tcoMonthlyEnergy(report)
  const homeShare = tco?.inputs?.homeChargingPercent
  // The engine derives the home share from either a confirmed home charger or just the chosen method; only warn in the latter case.
  const homeConfirmed = report.route === 'ready' || report.resistances.some(r => r.id === 'charging' && r.status === 'resolved')
  const homeShareAssumed = tco?.inputSources?.homeChargingPercent === 'derived_from_charging_method' && (homeShare ?? 0) > 0 && !homeConfirmed
  const chargerNotCounted = (homeShare ?? 0) > 0 && tco?.inputs?.homeChargerCost === 0 && tco?.inputSources?.homeChargerCost !== 'user'
  const costVerdict = difference == null ? '補充油資與里程後可估算差額。' : difference >= 0 ? '五年內就比較省，能源費節省足以抵銷換車支出。' : crossing == null ? '能源費較省，但十年內仍抵銷不了換車支出。' : `能源費較省，但要開到${payback(crossing)}後才開始比較划算。`
  return <>
    <div className="report-section-heading"><CircleDollarSign/><div><h2>換電車，成本會差多少？</h2><p>先看換車差額，再確認每月開銷與長期走勢。</p></div></div>
    {tco?.status === 'estimated' ? <div className="tco-analysis cost-reading-flow">
      <Card className="cost-takeaway">
        <div className="cost-comparison-picker" role="group" aria-label="成本比較對象">
          <span className="picker-label">和哪個選擇比？</span>
          <button aria-label={`相較換購 ${comparedTo}`} aria-pressed={comparison === 'new'} onClick={() => setComparison('new')}>換購{tco.comparisonVehicle || '全新油車'}</button>
          <button aria-label="相較繼續開現有車" aria-pressed={comparison === 'keep'} onClick={() => setComparison('keep')}>繼續開現有車</button>
        </div>
        <div className="cost-answer" aria-live="polite"><span>改買 bZ4X，相較{comparison === 'new' ? `換購${comparedTo}` : '繼續開現有車'}，五年累積成本</span><strong className={(difference ?? 0) >= 0 ? 'positive' : 'negative'}>{difference == null ? '暫無法估算' : signedMoney(difference)}</strong><p>{costVerdict}</p></div>
        <div className="cost-supporting"><div className="monthly-energy-metric"><span>bZ4X 每月能源費估算</span><strong>{evMonthly != null ? `約 ${money(evMonthly)}` : monthlyRange(report) ?? '暫不估算'}</strong><small>{evMonthly != null ? `居家充電 ${homeShare ?? '—'}%、平均每度 ${tco.inputs?.weightedElectricityRate ?? '—'} 元試算${monthlyRange(report) ? `；${rangeBasis(report)}約 ${monthlyRange(report)}` : ''}` : report.monthlyCost.note}</small></div><div><span>累積成本交叉時間</span><strong>{payback(crossing)}</strong><small>相較上方選定方案</small></div><div><span>每年能源費節省率</span><strong>{tco.annualEnergySavingsRate == null ? '暫無法估算' : `${tco.annualEnergySavingsRate}%`}</strong><small>相較現有車能源費；負值表示增加</small></div></div>
        {(homeShareAssumed || chargerNotCounted) && <div className="cost-assumption-warning" role="note"><ShieldCheck size={18} aria-hidden="true"/><p>{homeShareAssumed && `居家充電 ${homeShare}% 是依你選的補電方式推估，住家充電還沒確認可用；若最後只能用公共充電，能源費會較高（${rangeBasis(report)}約 ${monthlyRange(report) ?? '—'}），五年差額也會縮小。`}{chargerNotCounted && '試算未計入家充設備費（未填寫時以 0 元計）。'}<Link to={editUrl}>修改成本條件</Link></p></div>}
        <p className="cost-caveat">情境試算，非報價；不含貸款、保險與期末殘值。</p>
      </Card>
      <section className="cost-exploration" aria-label="成本比較分析">
        <h3>費用差在哪裡？</h3>
        <div className="analysis-cards" role="group" aria-label="選擇分析內容">
          <button aria-pressed={view === 'trend'} aria-controls="cost-analysis-panel" onClick={() => setView('trend')}><RouteIcon aria-hidden="true"/><span><b>十年累積走勢</b><small>看三條曲線何時交叉</small></span><span className="analysis-card-state">{view === 'trend' ? '正在查看' : '查看曲線 →'}</span></button>
          <button aria-pressed={view === 'breakdown'} aria-controls="cost-analysis-panel" onClick={() => setView('breakdown')}><CircleDollarSign aria-hidden="true"/><span><b>五年費用明細</b><small>對照車價、能源、保養與稅費</small></span><span className="analysis-card-state">{view === 'breakdown' ? '正在查看' : '查看細目 →'}</span></button>
        </div>
        <div id="cost-analysis-panel" role="region" aria-label={view === 'trend' ? '十年累積走勢' : '五年費用明細'}>{view === 'trend' ? <TcoCurveChart tco={tco}/> : <TcoBreakdown tco={tco}/>}</div>
      </section>
      <Card className="cost-basis">
        <div className="cost-basis-heading"><div><h3>這次試算使用的條件</h3><p>條件不同，差額與交叉時間也會改變。</p></div><Link className="button secondary" to={editUrl}>修改成本條件</Link></div>
        <dl><div><dt>年里程</dt><dd>{tco.inputs?.annualMileage?.toLocaleString() ?? '未提供'} km</dd></div><div><dt>居家充電比例</dt><dd>{tco.inputs?.homeChargingPercent ?? '未提供'}%{homeShareAssumed && <small>依補電方式推估</small>}</dd></div><div><dt>加權電價</dt><dd>{tco.inputs?.weightedElectricityRate ?? '未提供'} 元/kWh</dd></div><div><dt>現有車換購估值</dt><dd>{tco.inputs?.tradeInValue == null ? '未提供' : money(tco.inputs.tradeInValue)}</dd></div><div><dt>家充設備費</dt><dd>{tco.inputs?.homeChargerCost == null ? '未提供' : money(tco.inputs.homeChargerCost)}{chargerNotCounted && <small>未填寫，以 0 元計</small>}</dd></div></dl>
        <div className="cost-basis-footer"><p>{tco.note}</p><ReportDetailDialog title="試算條件與計算方式" label="完整條件與公式">
          <p>預計持有 {tco.plannedOwnershipYears} 年；比較統一採五年差額與十年曲線。</p><p>{tco.note}</p>
          <ul className="formula-list"><li>現有車能源費：優先使用每月油資 × 12；未提供時，以年里程 ÷ 平均油耗 × 油價假設。</li><li>bZ4X 能源費：年里程 × 18 kWh/100km ÷（1−10% 充電損耗）× 居家／公共加權電價。</li><li>累積持有成本：換購淨支出＋逐年能源費＋保養維修＋稅費。</li><li>交叉時間：bZ4X 累積成本首次低於比較方案的估計時間；十年內可能未交叉。</li></ul>
          <h3>資料採用方式</h3><p>未提供的條件依情境假設處理，並非已確認報價。</p><p>家充設備費：{tco.inputs?.homeChargerCost == null ? '未提供' : money(tco.inputs.homeChargerCost)}；現有車齡：{tco.inputs?.vehicleAge ?? '未提供'} 年；平均油耗：{tco.inputs?.fuelEfficiencyKmPerL ?? '未提供'} km/L。</p>
        </ReportDetailDialog></div>
      </Card>
    </div> : <Card className="report-empty"><CircleDollarSign/><div><h3>尚無法建立累積成本比較</h3><p>{tco?.note || '這份報告尚未包含持有成本試算，請補充條件後重新評估。'}</p><Link className="button secondary" to={editUrl}>補充成本條件</Link></div></Card>}
    {tco?.status !== 'estimated' && <>        <Card className="report-cost"><div className="report-cost-estimate"><Pill>每月估算</Pill><strong>{report.monthlyCost.min !== null && report.monthlyCost.max !== null ? <><small>NT$</small> {report.monthlyCost.min.toLocaleString()}–{report.monthlyCost.max.toLocaleString()}</> : '暫不估算'}</strong><p>{report.monthlyCost.note}</p>{report.monthlyCost.max === null && <Link className="button secondary" to={editUrl}>補充能源花費</Link>}</div><div className="cost-assumptions"><h3>如何閱讀這個區間</h3><span><Clock3/>計算單位：每月行駛能源費</span><span><BatteryCharging/>補電方式、電價與里程會影響結果</span><span><ShieldCheck/>能源區間不含車價、貸款與保險</span></div></Card></>}
  </>
}

// The TCO and the monthly range can rest on different electricity prices; label each with its basis.
const tcoMonthlyEnergy = (report: DriverProjection) => { const annual = report.tcoAnalysis?.status === 'estimated' ? report.tcoAnalysis.annualEnergyCost?.bz4x : undefined; return annual == null ? null : Math.round(annual / 12) }
const rangeBasis = (report: DriverProjection) => { const { priceLow, priceHigh } = report.monthlyCost.inputs; return priceLow != null && priceHigh != null ? `以每度 ${priceLow}–${priceHigh} 元計` : '' }
const monthlyRange = (report: DriverProjection) => report.monthlyCost.min != null && report.monthlyCost.max != null ? `${money(report.monthlyCost.min)}–${report.monthlyCost.max.toLocaleString('zh-TW')}` : null
// PRD §6: "no data" (outside coverage) and "no nearby station" must never be shown as the same thing.
const chargingStatusCopy = {
  no_data: { title: '這個區域目前沒有充電站資料', detail: '資料尚未覆蓋你填的區域，這不代表附近沒有充電站；請與顧問確認，或改填其他常去區域。' },
  no_nearby_station: { title: '資料範圍內，附近沒有相容的站點', detail: '已查到這個區域的資料，但沒有同時符合接頭與你可充電時段的站點。可調整可充電時段再試。' },
  provider_error: { title: '充電站資料暫時查不到', detail: '資料來源暫時無法使用，這次沒有列入充電判斷；稍後重新評估即可。' },
} as const
// Partial coverage with fewer candidates than the backup threshold is reported as no_data; with stations listed, say so plainly.
const partialCoverageCopy = { title: '這個區域的充電站資料還不完整', detail: '以下是目前查得到、符合接頭與時段的候選站；資料尚未涵蓋整個區域，實際可能還有其他站點，備援站需再確認。' }
// Journeys map to plans by role: the everyday trip uses the daily plan, a long trip the destination / backup one.
function journeyPlan(report: DriverProjection, label: string, index: number) {
  const long = /長途|休閒|返鄉|出遊/.test(label)
  const byPurpose = report.plans.find(p => 'purpose' in p && p.purpose === (long ? 'destination_only' : 'daily'))
  return byPurpose ?? (long ? report.plans[report.plans.length - 1] : report.plans[Math.min(index, report.plans.length - 1)])
}
const planRole = (plan: DriverProjection['plans'][number], index: number) => 'purpose' in plan ? { daily: '日常補電', backup: '備援', destination_only: '長途目的地' }[plan.purpose] : index === 0 ? '主要方案' : '備援'

/** The landing page asks three questions; the report answers them first, then links to the detail tab. */
function ReportAnswers({ report, openTab }: { report: DriverProjection; openTab: (id: string, scroll?: boolean) => void }) {
  const [primary, ...backups] = report.plans
  const tco = report.tcoAnalysis?.status === 'estimated' ? report.tcoAnalysis : undefined
  const range = monthlyRange(report)
  const answers = [
    { tab: 'charging', icon: BatteryCharging, question: '能不能充？', answer: primary ? primary.title : '尚無可確認的補電方案', detail: primary ? (backups.length ? `另有 ${backups.length} 個備援方案` : '目前只有一個方案，建議再找備援') : '補充充電條件後可重新評估', link: '看補電安排' },
    { tab: 'journey', icon: RouteIcon, question: '敢不敢跑？', answer: report.journeys.length ? report.journeys[0].title : '尚待補充行程資訊', detail: report.journeys.length > 1 ? `另評估：${report.journeys.slice(1).map(j => j.label).join('・')}` : report.journeys.length ? report.journeys[0].detail : '補上通勤距離或常去目的地', link: '看生活情境' },
    { tab: 'cost', icon: CircleDollarSign, question: '值不值得換？', answer: tcoMonthlyEnergy(report) != null ? `每月能源費約 ${money(tcoMonthlyEnergy(report)!)}` : range ? `每月能源費約 ${range}` : '能源費暫不估算', detail: tco?.fiveYearSavingsVsNewIce != null ? `五年相較換購${tco.comparisonVehicle || '全新油車'}：${signedMoney(tco.fiveYearSavingsVsNewIce)}` : report.monthlyCost.note, link: '看成本分析' },
  ]
  return <section className="report-answers" aria-label="三個關鍵問題">
    {answers.map(({ tab, icon: Icon, question, answer, detail, link }) => <button key={tab} type="button" onClick={() => openTab(tab, true)}>
      <span className="answer-question"><Icon aria-hidden="true"/>{question}</span>
      <strong>{answer}</strong><small>{detail}</small>
      <span className="answer-link">{link}<ChevronRight size={16} aria-hidden="true"/></span>
    </button>)}
  </section>
}

const lampName = (path: DriverProjection['path']) => path === 'green' ? '綠燈' : path === 'yellow' ? '黃燈' : path === 'gray' ? '灰燈' : '待確認'
function ScenarioColumn({ tag, report, muted = false }: { tag: string; report: DriverProjection; muted?: boolean }) {
  const top = [...report.resistances].sort((a, b) => b.score - a.score)[0]
  return <Card className={`scenario-column ${report.path ?? 'pending'}${muted ? ' muted' : ''}`}>
    <h3 className="scenario-tag">{tag}</h3>
    <StatusBadge path={report.path} pendingLabel={report.pathLabel}/>
    <p className="scenario-headline">{report.headline}</p>
    <dl>
      <div><dt>每月能源費</dt><dd>{monthlyRange(report) ?? '暫不估算'}</dd></div>
      <div><dt>最大阻力</dt><dd>{top ? `${top.title}（${top.score}）` : '無'}</dd></div>
      <div><dt>建議下一步</dt><dd>{report.nextActions[0]?.label ?? '—'}</dd></div>
    </dl>
  </Card>
}
/** Before/after cards plus a plain-language verdict on what the condition actually changes. */
function WhatIfComparison({ report, simulation, simulating, onSimulate }: { report: DriverProjection; simulation?: DriverProjection; simulating: boolean; onSimulate: () => void }) {
  const verdict = !simulation ? null
    : simulation.path !== report.path ? `家充可用後，燈號從${lampName(report.path)}變成${lampName(simulation.path)}。`
    : `只有家充還不夠，燈號仍是${lampName(simulation.path)}。${simulation.pendingConfirmations.length ? `還需要：${simulation.pendingConfirmations.join('、')}。` : simulation.resistances.some(r => r.status === 'high') ? `主要限制仍在：${simulation.resistances.filter(r => r.status === 'high').map(r => r.title).join('、')}。` : ''}`
  return <div className="whatif">
    <div className="whatif-grid">
      <ScenarioColumn tag={`目前 v${report.version}`} report={report}/>
      <div className="whatif-arrow" aria-hidden="true"><ChevronRight/><span>住家充電可用</span></div>
      {simulation ? <ScenarioColumn tag={`模擬 v${simulation.version}`} report={simulation}/> : <Card className="scenario-column placeholder">
        <h3 className="scenario-tag">假設模擬</h3><p className="scenario-headline">假設住家充電已經可以用</p><p>試算補電條件改變後，燈號、能源費與下一步會怎麼變。</p>
        <Button disabled={simulating} onClick={onSimulate}>{simulating ? '正在試算…' : '模擬家充可用'} <Sparkles size={16}/></Button>
      </Card>}
    </div>
    {verdict && <p className={`whatif-verdict ${simulation?.path !== report.path ? 'changed' : 'same'}`} role="status">{verdict}</p>}
  </div>
}

const resistanceLevel = { high: '主要阻力', pending: '待確認', manageable: '可以處理', resolved: '已解決' } as const
// PRD §4: each card shows how complete its evidence is — settled results are 高, conditional 中, unconfirmed 低.
const evidenceLevel = { high: '高', resolved: '高', manageable: '中', pending: '低' } as const
function ResistanceChecklist({ report, editUrl }: { report: DriverProjection; editUrl: string }) {
  const items = [...report.resistances].sort((a, b) => b.score - a.score)
  const pending = report.pendingConfirmations
  return <Card className="resistance-checklist">
    <div className="checklist-heading"><div><h2>轉電前，先處理這幾件事</h2><p>依影響程度排序；分數 0–100，越高越需要優先處理。</p></div></div>
    <ol>{items.map(item => <li key={item.id} className={item.status}>
      <span className={`level ${item.status}`}>{resistanceLevel[item.status]}</span>
      <div><b>{item.title}</b><span className="evidence-level">資料完整度：{evidenceLevel[item.status]}</span><p>{item.description}</p>{item.improvement && item.improvement !== item.description && <p className="improvement">建議：{item.improvement}</p>}</div>
      <span className="impact" aria-label={`影響程度 ${item.score} 分（滿分 100）`}><strong>{item.score}</strong><i><span style={{ width: `${item.score}%` }}/></i></span>
    </li>)}</ol>
    {pending.length > 0 && <div className="checklist-pending"><h3><ShieldCheck size={18} aria-hidden="true"/>還需要你確認</h3><ul>{pending.map(item => <li key={item}>{item}</li>)}</ul><Link className="button secondary" to={editUrl}>補充用車條件</Link></div>}
  </Card>
}

function ReportPage() { const { reportId = '' } = useParams(); const [params, setParams] = useSearchParams(); const nav = useNavigate(); const location = useLocation();
  const arrivedReport = (location.state as { report?: DriverProjection } | null)?.report
  const initialReport = arrivedReport?.reportFamilyId === reportId ? arrivedReport : undefined
  const loaded = useData(() => readReport(reportId, 'driver'), reportId, reportId.startsWith('family-'), initialReport)
  const [simulation, setSimulation] = useState<DriverProjection>(); const [actionError, setActionError] = useState(''); const [simulating, setSimulating] = useState(false)
  if (loaded.error && !loaded.data) return <div className="center-page"><StatePanel kind="error" onReset={loaded.reload}/><p role="alert">{loaded.error.message}</p></div>
  if (!loaded.data) return <div className="center-page"><StatePanel kind="loading"/></div>
  const report = loaded.data
  const shownSimulation = simulation?.basedOnReportId === report.id ? simulation : undefined
  // PRD §4: every report offers a "now → after the condition" simulation, gray and pending ones included.
  const tabs = [{ id: 'overview', label: '總覽' }, { id: 'charging', label: '充電策略' }, { id: 'journey', label: '生活情境' }, { id: 'cost', label: '成本分析' }, { id: 'whatif', label: '條件模擬' }]
  const requestedTab = params.get('tab') || 'overview'; const tab = tabs.some(item => item.id === requestedTab) ? requestedTab : 'overview'
  const simulate = async () => { setSimulating(true); try { setSimulation(await dataClient.simulate(report.id, { type: 'home-charger-approved', value: true })); setActionError('') } catch (e) { setActionError(String(e)) } finally { setSimulating(false) } }
  const editUrl = `/driver/diagnostic?session=${report.sessionId}&edit=1`
  const openTab = (id: string, scroll = false) => { params.set('tab', id); setParams(params); if (scroll) requestAnimationFrame(() => document.querySelector('.report-page > .tabs')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }
  const showMap = report.ruleVersion.startsWith('fixture-legacy') && report.plans.length > 0
  const staleStations = report.contractVersion === '0.3' && report.sources.some(source => source.sourceKind === 'tdx' && source.freshness === 'stale')
  const limitedSources = report.sources.some(source => 'freshness' in source && (source.freshness !== 'fresh' || ('coverage' in source && source.coverage !== 'complete')))
  return <div className={`report-page report-view-${tab}`}>
    {loaded.error && <div className="report-load-warning" role="status"><span>暫時無法確認是否有更新版本，正在顯示已完成的報告。</span><Button variant="quiet" onClick={loaded.reload}>重試讀取</Button></div>}
    <div className="report-title"><div><div className="eyebrow">MY EV JOURNEY</div><h1>我的轉電報告</h1></div><Link className="button secondary" to={editUrl}>修改用車條件</Link></div>
    <div className="report-meta"><span>評估版本 v{report.version}</span><span><Clock3/> 更新於 {new Date(report.createdAt).toLocaleString('zh-TW')}</span></div>
    <div className="report-summary"><PathDecisionCard report={report}/><div className="report-cover" aria-hidden="true"/></div>
    <p className="report-essential-note">{report.ruleVersion.startsWith('fixture-') ? '展示情境・非即時站況或正式報價。' : limitedSources ? '部分來源過期、未確認或覆蓋不完整；請核對來源明細。' : '站點為候選、費用為估算；出發前仍需確認。'}</p>
    <Tabs items={tabs} active={tab} onChange={id => openTab(id)}/>
    <section className="report-tab-content" aria-label={tabs.find(item => item.id === tab)?.label}>
      {tab === 'overview' && <>
        <ReportAnswers report={report} openTab={openTab}/>
        <div className="report-grid overview-reading-flow">
          <ResistanceChecklist report={report} editUrl={editUrl}/>
          <details className="report-disclosure basis-disclosure"><summary>這份判斷的前提（{report.assumptions.length} 項）<span>條件改變時，燈號與建議也會跟著調整。</span></summary><ul>{report.assumptions.map(a => <li key={a}>{a}</li>)}</ul></details>
        </div>
        {report.path && report.path !== 'gray' && <div className="product-bridge"><Card><div><Pill tone="fixture">{report.contractVersion === '0.3' ? 'bZ4X 適配・條件評估' : 'bZ4X 適配・示意'}</Pill><h2>當路徑可行，再談適合你的車</h2></div><ul>{report.recommendations.slice(0,3).map(r => <li key={r}>✓ {r}</li>)}</ul>{report.successCases[0] && <p className="case">{report.successCases[0]}</p>}</Card></div>}
      </>}
      {tab === 'charging' && <>
        <div className="report-section-heading"><BatteryCharging/><div><h2>你的補電安排</h2><p>先確認日常補電，再查看可用的備援候選。</p></div></div>
        {report.chargingDataStatus !== 'available' && (() => { const copy = report.chargingDataStatus === 'no_data' && report.plans.length ? partialCoverageCopy : chargingStatusCopy[report.chargingDataStatus]; return <div className={`charging-data-status ${report.chargingDataStatus}`} role="note"><b>{copy.title}</b><span>{copy.detail}</span></div> })()}
        <div className={`charging-grid ${showMap ? 'with-map' : 'without-map'}`}>
          {showMap ? <Card className="charging-map-details"><h3>補電位置示意</h3><p>對照各方案的位置；展示地圖不代表即時導航。</p><MapGraphic/></Card> : <div className="report-info"><ShieldCheck size={20}/><p>{report.contractVersion === '0.3' ? '候選不代表即時有空位；未知接頭、時段或過期資料不算已確認備援。長途目前僅提供目的地候選。' : '依目前資料範圍評估，請在出發前確認接頭、時段與現場限制。'}</p></div>}
          {report.plans.length ? <div className="plans">{report.plans.map((p, i) => <Card key={p.name} className={i === 0 ? 'primary-plan' : ''}><div className="plan-tags"><Pill tone="fixture">{p.name}</Pill><span className="plan-role">{planRole(p, i)}</span></div><h3>{p.title}</h3><p>{p.description}</p><small><Clock3 size={16}/>{p.timing === 'day' ? '白天（08:00–18:00）' : p.timing === 'night' ? '夜間（18:00–翌日08:00）' : p.timing}</small>{'limitations' in p && p.limitations.length > 0 && <div className="plan-details"><p className="plan-key-limit">{p.limitations[0]}</p><ReportDetailDialog title={`${p.name}｜使用前需確認`} label={`查看 ${p.limitations.length} 項使用條件`}><ul>{p.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul></ReportDetailDialog></div>}</Card>)}</div> : <Card className="report-empty"><MapPin/><div><h3>目前還沒有可確認的補電方案</h3><p>{staleStations ? '充電站資料已超過更新期限，過期站點不會列為可確認方案；資料更新後重新評估即可看到候選站。' : report.chargingDataStatus !== 'available' ? '確認住家或公司能否充電，或補上其他常去區域與可充電時段後，重新評估即可。' : '住家／公司充電尚未確認可用，附近也沒有同時符合接頭與你可充電時段的候選站。常見原因是還沒選擇「可使用公共充電的時段」，或所在區域不在目前的資料範圍內。'}</p><Link className="button secondary" to={editUrl}>補充充電條件</Link></div></Card>}
        </div>
      </>}
      {tab === 'journey' && <>
        <div className="report-section-heading"><RouteIcon/><div><h2>放進日常生活，看看怎麼用</h2><p>以下只呈現目前資料能評估的行程。</p></div></div>
        {report.journeys.length ? <ol className="journey-timeline">{report.journeys.map((j, i) => { const plan = journeyPlan(report, j.label, i); return <li key={j.label}>
          <span className="journey-dot" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <Card className="journey-card"><div><Pill>{j.label}</Pill><h3>{j.title}</h3><p>{j.detail}</p></div>{plan && <div className="journey-plan"><small>對應補電</small><b>{plan.name}・{plan.title}</b></div>}</Card>
        </li> })}</ol> : <Card className="report-empty"><RouteIcon/><div><h3>尚待補充行程資訊</h3><p>補上通勤距離或常去目的地後，即可重新評估生活情境。</p><Link className="button secondary" to={editUrl}>補充行程條件</Link></div></Card>}
      </>}
      {tab === 'cost' && <CostReport key={report.id} report={report} editUrl={editUrl}/>}
      {tab === 'whatif' && <>
        <div className="report-section-heading"><Sparkles/><div><h2>如果家裡可以充電，路徑會怎麼變？</h2><p>只試算假設條件，不會修改正式報告；確認成立後再到「修改用車條件」更新。</p></div></div>
        <WhatIfComparison report={report} simulation={shownSimulation} simulating={simulating} onSimulate={simulate}/>
        {actionError && <p role="alert">{actionError}</p>}
      </>}
    </section>
    <section className="report-next-step" aria-labelledby="report-next-title"><h2 id="report-next-title">接下來可以這樣做</h2><div className="report-actions"><NextActions report={report} onAction={kind => kind === 'reevaluate' ? nav(editUrl) : nav(`/driver/booking/${report.id}?kind=${kind}`)}/>{report.path && report.path !== 'gray' && <Button variant="quiet" onClick={() => nav(`/line/result/${report.reportFamilyId}`)}><MessageCircle size={16}/>回到 LINE 看摘要</Button>}</div></section>
    <div className="report-evidence-strip"><div><ShieldCheck aria-hidden="true"/><div><b>資料依據</b><p>{limitedSources ? '部分來源待確認；使用建議前請核對限制。' : report.ruleVersion.startsWith('fixture-') ? '展示情境與工程假設，非即時資料。' : '依官方車規、候選站點與試算假設整理。'}</p></div></div><ReportDetailDialog title="資料來源與使用限制" label="核對來源明細"><p className="report-identifier">報告 {report.id}</p><SourceStatus expanded sources={report.sources} generationMode={report.contractVersion === '0.3' ? report.generationMode : undefined}/><p>能源費用採工程假設，非正式報價；充電候選不保證到站可用。</p></ReportDetailDialog></div>
    <ReportControls report={report}/>
  </div>
}


function LineResult() { const { reportId = '' } = useParams(); const loaded = useData(() => readReport(reportId, 'line_summary'), reportId, reportId.startsWith('family-')); if (loaded.error) return <><StatePanel kind="error" onReset={loaded.reload}/><p>{loaded.error.message}</p></>; if (!loaded.data) return <StatePanel kind="loading"/>; const report = loaded.data; return <div className="line-layout authentic-line"><div className="line-copy"><Pill>報告摘要</Pill><h1>你的轉電報告，隨條件更新。</h1></div><LineFrame><div className="lp-date date">今天</div><LineBot time="下午3:05"><p>你的轉電報告已完成，重點整理如下：</p></LineBot><LineBot first={false} card time="下午3:05"><div className={`lp-flex line-result-card ${report.path}`}><div className="lp-flex-body"><StatusBadge path={report.path} pendingLabel={report.pathLabel}/><h2>{report.headline}</h2><p>{report.summary}</p><SourceStatus sources={report.sources} generationMode={report.contractVersion === '0.3' ? report.generationMode : undefined}/><small>報告 v{report.version}・{report.kind === 'simulation' ? '假設模擬' : '正式評估'}</small></div><div className="lp-flex-footer"><Link className="lp-flex-primary" to={`/driver/report/${report.reportFamilyId}`}>查看完整報告</Link></div></div></LineBot></LineFrame></div> }

function NotFound() { return <div className="center-page"><StatePanel kind="empty"/></div> }
export default function App() { return <BrowserRouter><Routes><Route element={<Shell/>}><Route index element={<Navigate to="/driver" replace/>}/><Route path="driver" element={<DriverLanding/>}/><Route path="driver/diagnostic" element={<DriverDiagnostic/>}/><Route path="driver/booking" element={<Booking/>}/><Route path="driver/booking/:reportId" element={<Booking/>}/><Route path="driver/analysis" element={<Analysis/>}/><Route path="driver/report/:reportId" element={<ReportPage/>}/><Route path="line" element={<LinePage/>}/><Route path="line/result/:reportId" element={<LineResult/>}/><Route path="advisor" element={<AdvisorList/>}/><Route path="advisor/reports/:reportId" element={<AdvisorDetail/>}/><Route path="*" element={<NotFound/>}/></Route></Routes></BrowserRouter> }
