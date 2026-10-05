"""v0.4 deterministic evaluation over pinned, validated source snapshots (see package docstring)."""
import copy
import hashlib
import json
from datetime import datetime, timezone
from ..v02.engine import evaluate as arithmetic_kernel, RULES as LEGACY_RULES
from ...grounded.contracts import SourceEnvelope
from ..v03.planning import candidates, plan_charging

ENGINE_VERSION='grounded-rules-0.4.0'
RULES={**copy.deepcopy(LEGACY_RULES),'version':'grounded-engineering-0.4',
       'staticTtlSeconds':86400,'dynamicTtlSeconds':300,'longTripRoutingAvailable':False}


def area_code(value):
    return '63000100' if value in ('台北市內湖區','臺北市內湖區','63000100') else '00000000'


def journeys(val, usable, planned, no_commute=False):
    """Conservative everyday and long-trip scenarios (PRD §4 行程／續航)."""
    out=[]
    distance=0 if no_commute else val('distance')
    if distance is None:
        out.append({'label':'平日通勤','title':'通勤距離待確認','detail':'補上單程通勤距離後，即可估算補電頻率'})
    elif not distance:
        out.append({'label':'平日通勤','title':'無固定開車通勤','detail':'日常補電依實際用車里程安排'})
    else:
        daily=2*float(distance)
        out.append({'label':'平日通勤','title':f'每日往返 {daily:g} km',
                    'detail':f'約佔保守可用里程 {usable:g} km 的 {round(100*daily/usable)}%；'+('一週補電約 1 次即可' if daily*5<=usable*1.6 else '建議每 2–3 天補電一次')})
    freq,km,stop=val('tripFrequency'),val('longDistance'),val('chargingStop')
    if freq in (None,'幾乎沒有'):
        return out
    if km is None:
        out.append({'label':'長途返鄉／出遊','title':f'長途頻率：{freq}','detail':'補上最長單程距離、目的地與可停留時間後，才能評估長途補電'})
        return out
    km=float(km); title=f'單程 {km:g} km・{freq}'
    destination=[p for p in planned['plans'] if p['purpose']=='destination_only']
    if km<=usable/2:
        detail=f'來回 {2*km:g} km 在保守可用里程 {usable:g} km 內，出發前充飽即可，不需中途補電'
    elif km<=usable:
        detail=('單程可達；回程前需在目的地補電' + (f'（可停留 {float(stop):g} 分鐘）' if stop is not None else '')
                + ('，目的地已有相容候選站' if destination else '，目的地尚未找到相容候選站'))
    else:
        detail=f'單程超過保守可用里程 {usable:g} km，需要沿途補電；目前尚未評估沿途站點'
    out.append({'label':'長途返鄉／出遊','title':title,'detail':detail})
    return out


def evaluate_grounded(fields, evidence, *, evaluated_at, rules=None):
    rules=rules or RULES
    source={k:SourceEnvelope.model_validate(v) for k,v in sorted(evidence.items())}
    profile=source['vehicle'].payload['profile']
    def val(key):
        value=fields.get(key,{})
        return value.get('value') if value.get('status')=='provided' else None
    connectors={c for c in (profile['acConnector'],profile['dcConnector']) if c}
    class Vehicle:
        def get(self):return {'id':source['vehicle'].snapshotId,'connector':'target-profile',
            'range':rules['usableRangeKm'],'energy':rules['energyKwhPer100Km'],
            'label':'台灣 bZ4X 官方接頭；可用里程與能耗為工程假設'}
    class Charging:
        def query(self, area, connector, window):
            current=source['destination'] if area==val('leisure') and 'destination' in source else source['charging']
            code=area_code(area)
            if current.query.get('areaCode')!=code:
                return {'id':current.snapshotId,'status':'no_data','stations':[],'area':area,'connector':connector,'window':window}
            result=candidates(current,area_code=code,window=window or None,connectors=connectors,
                              now=evaluated_at,ttl_seconds=rules['staticTtlSeconds'])
            enough=len(result['candidates'])>=rules['publicMinimumCompatibleStations']
            status='available' if enough else 'no_nearby_station' if result['status']=='known_empty' else 'no_data'
            if result['coverage']=='complete' and result['freshness']=='fresh' and result['candidates']:
                status='available'
            return {'id':current.snapshotId,'status':status,'stations':result['candidates'],'area':area,'connector':connector,'window':window}
    class Cost:
        def get(self,home):
            prices=source['cost'].payload
            return {'id':source['cost'].snapshotId,'prices':prices['home' if home else 'public'],
                    'loss':prices['loss']}
    result=arithmetic_kernel(fields,rules=rules,vehicle=Vehicle(),charging=Charging(),cost=Cost())
    if result['route']=='ready':
        result['headline']='已提供的主要補電與通勤條件符合目前評估範圍'
    # En-route reachability is not assessed. Only a trip whose one-way distance exceeds the usable
    # range depends on it; shorter trips are covered by the kernel's round-trip / destination checks.
    long_km=val('longDistance')
    if val('tripFrequency') not in (None,'幾乎沒有') and long_km is not None and float(long_km)>rules['usableRangeKm'] and result['route']!='not_ready':
        result.update(route=None,path=None,pathLabel='長途條件待確認',headline='需再確認長途沿途補電與停靠安排',
                      evaluationStatus='needs_confirmation',recommendations=[],successCases=[],
                      nextActions=[{'label':'補充或改善條件後重評','kind':'reevaluate'}])
        result['pendingConfirmations'].append('長途沿途充電與停留安排（目前只提供目的地候選）')
    daily=source['charging']
    stable='home' if val('homeCharging')=='available' else 'work' if val('workCharging')=='available' else None
    planned=plan_charging(daily=daily,area_code=daily.query['areaCode'],window=val('chargingWindow'),
        ac_connector=profile['acConnector'],dc_connector=profile['dcConnector'],now=evaluated_at,
        stable_charging=stable,destination=source.get('destination'),
        destination_area=source['destination'].query['areaCode'] if 'destination' in source else None,
        destination_window='day',ttl_seconds=rules['staticTtlSeconds'])
    result.update(contractVersion='0.3',engineVersion=ENGINE_VERSION,composerVersion='grounded-composer-1',
                  targetVehicleProfileId=profile['id'],evaluatedAt=evaluated_at.isoformat(),generationMode='template',
                  summary='依已提交條件、官方車規與 TDX 快取評估；站點候選不代表即時有空位或完整長途可行。',
                  dataSnapshotIds=[s.snapshotId for s in source.values()],
                  sources=[],citations=source['vehicle'].payload['citations'],
                  _sourceSnapshots={s.snapshotId:s.model_dump(mode='json') for s in source.values()},
                  _ruleSnapshot=rules,_evidenceKeys={k:s.snapshotId for k,s in source.items()})
    labels={'vehicle':'Toyota 台灣 bZ4X 完整規配','charging':'TDX 內湖充電候選（部分區域已核對）',
            'destination':'TDX 目的地查詢範圍','cost':'能源費率與損耗工程假設'}
    for key,s in source.items():
        result['sources'].append({'label':labels[key],'status':'assumption' if s.sourceKind=='assumption' else 'fixture' if s.sourceKind=='demo' else 'verified',
            'updatedAt':s.sourceUpdatedAt.isoformat() if s.sourceUpdatedAt else '',
            'snapshotId':s.snapshotId,'sourceKind':s.sourceKind,'origin':s.origin,
            'retrievedAt':s.retrievedAt.isoformat(),'sourceUpdatedAt':s.sourceUpdatedAt.isoformat() if s.sourceUpdatedAt else None,
            'freshness':s.freshness_at(evaluated_at,rules['staticTtlSeconds']),
            'coverage':s.coverage,'missingFields':s.missingFields})
    result['journeys']=journeys(val,rules['usableRangeKm'],planned,fields.get('distance',{}).get('status')=='not_applicable')
    result['plans']=[]
    for p in planned['plans']:
        station=p.get('station')
        result['plans'].append({'name':'Plan '+p['name'],'title':station['name'] if station else '已提供的住家／公司補電安排',
            'description':'行政區內候選，出發前仍須確認現場限制。' if station else '依車主提交的可用條件評估。',
            'timing':val('chargingWindow') or '待確認','purpose':p['purpose'],
            'stationIds':[station['stationId']] if station else [],
            'snapshotIds':[station['snapshotId']] if station else [],'limitations':planned['limitations']})
    result['assumptions']=['目標車：台灣 bZ4X '+profile['specificationCode'],
        '可用里程與能耗是工程假設；不以官方實驗室測試續航取代',
        '費率區間與充電損耗是工程假設；不含設備、停車與其他服務費',*planned['limitations']]
    if 'independent_backup_station' in planned['missingFields']:
        result['pendingConfirmations'].append('尚未確認符合接頭與使用時段的獨立備援站')
    for card in result['resistances']:
        card['description']=card['description'].replace('（工程種子）','（TDX 候選，非即時空位）')
        card['evidence']=[s.replace('（工程種子）','（TDX 候選，非即時空位）') for s in card['evidence']]
    if result['route'] not in (None,'not_ready'):
        result['recommendations']=['可依此報告與顧問討論 bZ4X；仍須核對現場充電與實際行程。']
    return result
