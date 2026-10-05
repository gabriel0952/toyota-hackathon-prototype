import hashlib
import json
from pathlib import Path
from .providers import SeedVehicle, SeedCharging, SeedCost, TemplateComposer
from .tco import calculate_tco

RULES = json.loads(Path(__file__).with_name('rulebook.json').read_text())
RULE_VERSION = RULES['version'] + '-' + hashlib.sha256(json.dumps(RULES, sort_keys=True).encode()).hexdigest()[:12]


def evaluate(fields, rules=None, vehicle=None, charging=None, cost=None, composer=None):
    rules = rules or RULES
    version = rules['version'] + '-' + hashlib.sha256(json.dumps(rules, sort_keys=True).encode()).hexdigest()[:12]
    vehicle = (vehicle or SeedVehicle(rules)).get()
    charging = charging or SeedCharging()
    price_provider = cost or SeedCost(rules)
    composer = composer or TemplateComposer()
    def val(k):
        field = fields.get(k, {})
        return field.get('value') if field.get('status') == 'provided' else None
    missing = []
    snapshots = {}
    def snapshot(data):
        key = data['id'] + '-' + hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:12]
        snapshots[key] = data
        return key
    snapshot(vehicle)
    def require(k, label):
        v = val(k)
        if v is None: missing.append(label)
        return v
    def choice(k):
        v = val(k)
        return True if v in ['available', 'passed'] else False if v in ['unavailable', 'failed'] else None
    home, work, install = choice('homeCharging'), choice('workCharging'), choice('installAssessment')
    distance = val('distance')
    if fields.get('distance', {}).get('status') == 'not_applicable': distance = 0
    if distance is None: missing.append('平日單程通勤')
    freq = require('tripFrequency', '長途頻率')
    travel = None
    if distance is not None and freq is not None:
        if 2 * distance > vehicle['range']:
            travel = False
        elif freq == '幾乎沒有':
            travel = True
        else:
            km = require('longDistance', '長途單程距離')
            stop = require('chargingStop', '長途可停留分鐘')
            destination = require('leisure', '長途目的地行政區')
            if None not in (km, stop, destination):
                backup = charging.query(destination, vehicle['connector'], 'day')
                snapshot(backup)
                if backup['status'] == 'provider_error': raise ConnectionError('Charging provider failed')
                if km <= vehicle['range'] / 2:
                    travel = True
                elif backup['status'] == 'no_data':
                    missing.append('目的地充電資料覆蓋')
                else:
                    travel = km <= 2 * vehicle['range'] and stop >= rules['longTripMinimumStopMinutes'] and len(backup['stations']) >= rules['publicMinimumCompatibleStations']
    area, window = val('home') or val('work'), val('chargingWindow')
    station = charging.query(area or '', vehicle['connector'], window or '')
    snapshot(station)
    if station['status'] == 'provider_error': raise ConnectionError('Charging provider failed')
    public = None
    if area and window and station['status'] != 'no_data':
        public = len(station['stations']) >= rules['publicMinimumCompatibleStations']
    stable = home is True or work is True
    install_pass = install is True and val('parking') == 'fixed'
    route = None
    alternatives = []
    if travel is False:
        route = 'not_ready'  # This shared trip constraint invalidates all charging alternatives.
    elif travel is True:
        if stable: route = 'ready'
        else:
            if install_pass: alternatives.append('home_install_required')
            if public is True: alternatives.append('public_charging_ready')
            if alternatives:
                if val('chargingMethod') == rules['publicPreferenceValue'] and public is True:
                    route = 'public_charging_ready'
                else: route = alternatives[0]
            elif home is False and work is False and install is False and public is False:
                route = 'not_ready'
    if route is None:
        if not stable and not alternatives:
            if home is None: missing.append('住家充電可用狀態')
            if work is None: missing.append('工作地充電可用狀態')
            if install is None: missing.append('裝樁初評狀態')
            if public is None: missing.append('補電行政區、時段或站點覆蓋')
    lamp, label, headline = composer.compose(route)
    prices = price_provider.get(stable or route == 'home_install_required')
    snapshot(prices)
    mileage = val('monthlyMileage')
    cost_result = {'status': 'unavailable', 'min': None, 'max': None, 'note': '缺少月里程、能耗或費率，暫不估算', 'unit': 'TWD/month', 'inputs': {}, 'formula': ''}
    if mileage is not None and vehicle.get('energy') is not None and prices.get('prices') is not None:
        low, high = prices['prices']
        kwh = mileage * vehicle['energy'] / 100 / (1 - prices['loss'])
        cost_result = {'status': 'estimated', 'min': round(kwh * low), 'max': round(kwh * high), 'note': '工程假設區間；不含車價、設備、保險。' + ('未提供油資，無法比較油電差額。' if val('monthlyCost') is None else '油資僅作現況參考。'), 'unit': 'TWD/month', 'inputs': {'monthlyKm': mileage, 'kwhPer100Km': vehicle['energy'], 'lossFraction': prices['loss'], 'priceLow': low, 'priceHigh': high}, 'formula': 'monthlyKm × kwhPer100Km / 100 / (1-lossFraction) × price'}
    tco_analysis = calculate_tco(fields, rules)
    statuses = [('charging', '穩定補電', True if stable else None if public is None and not install_pass else False, '確認主要補電安排'),
                ('public', '公共備援', public, '確認時段及相容主站與替代站'),
                ('travel', '行程與續航', travel, '補充長途資料或改善停靠安排'),
                ('cost', '能源成本', True if cost_result['status'] == 'estimated' else None, '補上里程與費率依據')]
    status_label = {True: '可用', False: '不可用', None: '待確認'}
    evidence = {'charging': f'住家／公司補電：{status_label[home]}／{status_label[work]}；裝樁初評：{status_label[install]}', 'public': f'{area or "尚未提供區域"}，符合接頭與時段 {len(station["stations"])} 站（工程種子）', 'travel': f'單程通勤 {distance if distance is not None else "待確認"} km；長途頻率：{freq or "待確認"}', 'cost': f'每月里程 {mileage if mileage is not None else "待確認"} km；費率為工程假設'}
    cards = []
    for key, title, passed, improvement in statuses:
        status = 'resolved' if passed is True else 'pending' if passed is None else 'high'
        score = rules['scores']['pass' if passed is True else 'unknown' if passed is None else 'fail']
        if key == 'charging' and (public is True or install_pass) and not stable:
            status, score = 'manageable', rules['scores']['conditional']
        cards.append({'id': key, 'title': title, 'score': score, 'status': status, 'description': evidence[key],
                      'evidence': [evidence[key], f'規則 {version}'], 'improvement': improvement})
    cards.sort(key=lambda c: (-c['score'], c['id']))
    supported = route not in (None, 'not_ready')
    return {'contractVersion': '0.2', 'ruleVersion': version, 'dataSnapshotIds': list(snapshots), '_sourceSnapshots': snapshots,
            'evaluationStatus': 'assessed' if route else 'needs_confirmation', 'path': lamp, 'route': route, 'pathLabel': label, 'headline': headline,
            'summary': '依已提交條件與工程種子資料計算；非即時充電查詢或購車保證。',
            'completeness': round(100 * sum(fields.get(k, {}).get('status') in ('provided', 'not_applicable') for k in rules['completenessFields']) / len(rules['completenessFields'])),
            'vehicle': val('vehicle') or '未提供車款', 'ownershipYears': val('ownershipYears') or 0,
            'resistances': cards[:3], 'monthlyCost': cost_result, 'tcoAnalysis': tco_analysis, 'chargingDataStatus': station['status'],
            'plans': [{'name': 'Plan A', 'title': label, 'description': '依條件落實補電安排；站點為工程種子。', 'timing': window or '待確認'}] if supported else [],
            'journeys': [{'label': '通勤', 'title': f'每日往返 {2 * distance:g} km' if distance is not None else '里程待確認', 'detail': '長途、時段及備援依上述證據檢核'}],
            'assumptions': ['車規與費率為工程假設，尚未驗證特定年式', '站點為種子，非真實可用性', '目前判定：' + label],
            'sources': [{'label': s, 'status': 'fixture', 'updatedAt': rules['seedUpdatedAt']} for s in [vehicle['label'], '充電種子區域：' + (area or '未提供'), '能源費率工程假設']],
            'recommendations': ['可依這份條件報告與顧問討論 bZ4X；適配仍需官方車規驗證'] if supported else [], 'successCases': [],
            'nextActions': ([{'label': '諮詢充電條件', 'kind': 'consult'}, {'label': '討論路線試駕', 'kind': 'test-drive'}] if supported else [{'label': '補充或改善條件後重評', 'kind': 'reevaluate'}]),
            'preciseLocations': {'home': '', 'work': '', 'leisure': ''}, 'blurredLocations': [val(k) or '未提供區域' for k in ['home', 'work', 'leisure']],
            'advisorNotes': [], 'pendingConfirmations': list(dict.fromkeys(missing)), 'suggestedQuestions': ['請依待確認項目與車主核對，勿將初評視為施工核准。']}
