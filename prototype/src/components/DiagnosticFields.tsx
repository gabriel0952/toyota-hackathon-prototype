import { useId, useState } from 'react'
import { estimateTradeInValue, findVehiclePreset } from '../domain/vehicle-presets'

type Answers = Record<string, string | number>
type Props = { answers: Answers; setAnswer: (key: string, value: string | number) => void }

function Amount({ label, hint, value, unit, max, onChange, disabled = false, optional = false }: { label: string; hint: string; value: string | number; unit: string; max: number; onChange: (value: string | number) => void; disabled?: boolean; optional?: boolean }) {
  const id = useId()
  const [touched, setTouched] = useState(false)
  const invalid = !disabled && ((value === '' && !optional) || (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > max)))
  return <div className="simple-amount"><label htmlFor={id}>{label}</label><p id={`${id}-hint`}>{hint}</p><div className="simple-number"><input id={id} type="number" inputMode="numeric" min={0} max={max} step="any" value={value} disabled={disabled} aria-invalid={touched && invalid} aria-describedby={`${id}-hint${touched && invalid ? ` ${id}-error` : ''}`} onBlur={() => setTouched(true)} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}/><span>{unit}</span></div>{touched && invalid && <p id={`${id}-error`} className="field-error" role="alert">請輸入 0–{max.toLocaleString()} {unit}{optional ? '，或留白使用情境假設。' : '，或勾選下方選項略過。'}</p>}</div>
}

const chargingMethods = [
  ['住家可安裝充電設備', '住家充電', '有設備，或有機會安裝'],
  ['公司提供充電', '公司充電', '工作地點有充電設備'],
  ['公司周邊公共充電', '公共充電', '商場、停車場或快充站'],
  ['尚無固定補電方式', '還不確定', '先完成診斷，再確認'],
]
// Follow-up questions shown directly under the chosen method; the rest stay optional.
// chargingWindow is asked of everyone: public stations without a window never qualify, even as backup.
const followUpsByMethod: Record<string, string[]> = {
  住家可安裝充電設備: ['parking', 'homeCharging', 'installAssessment'],
  公司提供充電: ['workCharging'],
}
const availability = [['', '尚不確定'], ['available', '已可使用'], ['unavailable', '無法使用']]
const chargingSelects: Record<string, { label: string; options: string[][] }> = {
  parking: { label: '住家停車條件', options: [['unknown', '還不確定'], ['fixed', '有固定車位'], ['street', '沒有固定車位']] },
  homeCharging: { label: '住家充電是否已可使用', options: availability },
  installAssessment: { label: '住家安裝評估', options: [['', '尚未確認'], ['passed', '已確認可安裝'], ['failed', '已確認無法安裝']] },
  workCharging: { label: '公司充電是否已可使用', options: availability },
  chargingWindow: { label: '可使用公共充電的時段', options: [['', '尚不確定'], ['day', '白天'], ['night', '夜間']] },
}

export function ParkingFields({ answers: a, setAnswer: set }: Props) {
  const followUps = followUpsByMethod[String(a.chargingMethod)] || []
  const others = Object.keys(chargingSelects).filter(key => !followUps.includes(key) && key !== 'chargingWindow')
  const select = (key: string) => <label key={key}>{chargingSelects[key].label}<select value={a[key] || ''} onChange={e => set(key, e.target.value)}>{chargingSelects[key].options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
  return <div className="simple-fields"><fieldset className="simple-choice"><legend>最可能的補電方式</legend><div>{chargingMethods.map(([value, title, hint]) => <label key={value} className={a.chargingMethod === value ? 'selected' : ''}><input type="radio" name="charging-method" checked={a.chargingMethod === value} onChange={() => set('chargingMethod', value)}/><span><b>{title}</b><small>{hint}</small></span></label>)}</div></fieldset>
    {followUps.length > 0 && <div className="charging-follow-up"><p>關於{chargingMethods.find(([value]) => value === a.chargingMethod)?.[1]}，目前的狀況是？<small>不確定可維持預設，報告會列為待確認。</small></p><div className="simple-extra">{followUps.map(select)}</div></div>}
    <div className="charging-window-question"><p>如果要用公共充電（日常或備援），通常什麼時段方便？<small>用來篩選附近營業中、接頭相容的候選站；沒選時段就找不到可確認的備援站。</small></p><div className="simple-extra">{select('chargingWindow')}</div></div>
    <details className="simple-details"><summary>補充停車與生活區域 <span>選填・可跳過</span></summary><div className="simple-extra">{others.map(select)}{[['home', '住家約略區域'], ['work', '公司約略區域']].map(([key, label]) => <label key={key}>{label}<input aria-label={label} value={a[key]} placeholder="填到行政區即可，可留白" onChange={(e) => { set(key, e.target.value); if (key === 'work') set('noWork', 0) }}/></label>)}</div></details></div>
}

export function JourneyFields({ answers: a, setAnswer: set }: Props) {
  const noCommute = a.noCommute === 1
  return <div className="simple-fields journey-fields"><div><Amount label="平日單程通勤" hint="只填去程的大約距離。" value={a.distance} unit="km" max={150} disabled={noCommute} onChange={(v) => set('distance', v)}/><label className="simple-check"><input type="checkbox" checked={noCommute} onChange={(e) => set('noCommute', e.target.checked ? 1 : 0)}/>我沒有固定開車通勤</label></div><label className="simple-select">多久會開車跑長途？<small>例如跨縣市返鄉或旅遊。</small><select aria-label="長途頻率" value={a.tripFrequency} onChange={(e) => set('tripFrequency', e.target.value)}>{['幾乎沒有', '偶爾', '每月 1–2 次', '每週'].map((v) => <option key={v}>{v}</option>)}</select></label>{a.tripFrequency !== '幾乎沒有' && <details className="simple-details"><summary>補充長途安排（選填）</summary><p>不確定可留白，報告會列出需要確認的條件。</p><div className="simple-extra"><label>最長單程距離（km）<input type="number" min="0" max="2000" value={a.longDistance ?? ''} onChange={e => set('longDistance',e.target.value)}/></label><label>可接受中途充電時間（分鐘）<input type="number" min="0" max="600" value={a.chargingStop ?? ''} onChange={e => set('chargingStop',e.target.value)}/></label><label>常見長途目的地區域<input placeholder="例如：台中市西屯區" value={a.leisure || ''} onChange={e => set('leisure',e.target.value)}/></label></div></details>}</div>
}

// Backend REPLACEMENT_PRESETS keys; other names silently fall back to RAV4 2.0 in the TCO engine.
const replacementVehicles = ['RAV4 2.0', 'COROLLA CROSS 1.8', 'CAMRY 2.0', 'RAV4 HYBRID']

export function CostFields({ answers: a, setAnswer: set }: Props) {
  const preset = findVehiclePreset(a.vehicle)
  const suggestedTradeIn = preset ? estimateTradeInValue(preset.newPrice, a.vehicleAge) : null
  return <div className="simple-fields cost-fields">
    {[{ key: 'monthlyCost', flag: 'unknownCost', label: '每月油資', hint: '只算加油費，填大約金額即可。', unit: '元', max: 30000, skip: '不確定油資，先略過' }, { key: 'monthlyMileage', flag: 'unknownMileage', label: '每月里程', hint: '包含通勤與假日出遊，不記得可以略過。', unit: 'km', max: 10000, skip: '不確定里程，先略過' }].map((field) => <div key={field.key}><Amount label={field.label} hint={field.hint} unit={field.unit} max={field.max} value={a[field.key]} disabled={a[field.flag] === 1} onChange={(v) => set(field.key, v)}/><label className="simple-check"><input type="checkbox" checked={a[field.flag] === 1} onChange={(e) => set(field.flag, e.target.checked ? 1 : 0)}/>{field.skip}</label></div>)}
    <label className="simple-select replacement-choice">如果不換電動車，你會考慮換哪台？<small>報告會拿它和 bZ4X 比較五年成本；想比油電車可選 RAV4 HYBRID。未決定時以 RAV4 2.0 為基準。</small>
      <select value={a.replacementVehicle} onChange={(e) => set('replacementVehicle', e.target.value)}>
        <option value="">尚未決定</option>
        {replacementVehicles.map(v => <option key={v}>{v}</option>)}
      </select>
    </label>
    <details className="simple-details tco-details">
      <summary>補充持有成本比較條件 <span>建議填寫，可讓五年試算更貼近實際</span></summary>
      <p className="tco-details-intro">這些條件只用於成本情境試算，不會改變充電與行程的燈號判斷。</p>
      <div className="simple-extra tco-extra">
        <Amount optional label="現有車平均油耗" hint="可參考儀表板近期平均值；留白時依車型假設。" value={a.fuelEfficiencyKmPerL} unit="km/L" max={50} onChange={(v) => set('fuelEfficiencyKmPerL', v)}/>
        <Amount optional label="預估居家充電比例" hint="留白時依你選的補電方式推估（選住家充電約 80%）；尚未確認能裝家充時，建議填保守一點的比例。" value={a.homeChargingPercent} unit="%" max={100} onChange={(v) => set('homeChargingPercent', v)}/>
        <div><Amount optional label="現有車預估換購價" hint={preset ? `可依 ${preset.name} 新車均價與車齡估算；留白時報告會標示未提供。` : '尚未取得估價可留白，報告會標示未提供。'} value={a.estimatedTradeInValue} unit="元" max={5000000} onChange={(v) => set('estimatedTradeInValue', v)}/>{suggestedTradeIn != null && Number(a.estimatedTradeInValue) !== suggestedTradeIn && <button type="button" className="trade-in-suggestion" onClick={() => set('estimatedTradeInValue', suggestedTradeIn)}>帶入估算值 NT$ {suggestedTradeIn.toLocaleString('zh-TW')}（車齡 {Math.max(1, Number(a.vehicleAge))} 年）</button>}</div>
        <Amount optional label="家充設備預估費用" hint="留白會以 0 元計，可能低估換電車的成本；已有估價或打算安裝時建議填入。" value={a.homeChargerCost} unit="元" max={1000000} onChange={(v) => set('homeChargerCost', v)}/>
        <Amount optional label="預計持有新車期間" hint="留白時以五年呈現；曲線仍統一顯示十年。" value={a.plannedOwnershipYears} unit="年" max={10} onChange={(v) => set('plannedOwnershipYears', v)}/>
      </div>
    </details>
  </div>
}
