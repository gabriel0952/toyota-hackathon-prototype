from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
import pytest
from decision_api.app import create_app
from decision_api.engine import evaluate, RULES
from decision_api.models import Answers


def fields(**values):
    return {k: {'value': v, 'status': 'provided' if v is not None else 'unknown', 'source': 'user', 'updatedAt': '2026-09-22T00:00:00Z'} for k,v in values.items()}


def base(**extra):
    return fields(**dict(dict(vehicle='RAV4', distance=18, tripFrequency='幾乎沒有', homeCharging='unavailable', workCharging='unavailable', installAssessment='failed', home='台北市內湖區', chargingWindow='day', monthlyMileage=1200, monthlyCost=4800), **extra))


@pytest.mark.parametrize('updates,route', [({},'public_charging_ready'), ({'homeCharging':'available'},'ready'), ({'installAssessment':'passed','parking':'fixed','chargingMethod':'住家可安裝充電設備'},'home_install_required'), ({'home':'示範無站區'},'not_ready'), ({'home':'未覆蓋行政區'},None)])
def test_routes(updates, route):
    r = evaluate(base(**updates)); assert r['route'] == route
    if route in (None,'not_ready'):
        assert not r['recommendations'] and not r['successCases']
        assert [a['kind'] for a in r['nextActions']] == ['reevaluate']
    assert len(r['resistances']) == 3
    assert all(c['evidence'] and c['improvement'] for c in r['resistances'])


def test_travel_and_unknown():
    r=evaluate(base(homeCharging='available',tripFrequency='每週',longDistance=700,chargingStop=30,leisure='台中市西屯區'))
    assert r['route']=='not_ready'
    r=evaluate(base(homeCharging='available',tripFrequency='每週',longDistance=None))
    assert r['route'] is None and r['path'] is None
    f=base(homeCharging='available'); f['distance']={'value':None,'status':'not_applicable','source':'user','updatedAt':'2026-09-22T00:00:00Z'}
    assert evaluate(f)['route']=='ready'


def test_cost_snapshots_and_preference():
    r=evaluate(base(monthlyMileage=0)); assert r['monthlyCost']['min']==0 and r['monthlyCost']['max']==0
    assert evaluate(base(monthlyMileage=None))['monthlyCost']['status']=='unavailable'
    assert evaluate(base())==evaluate(base())
    assert evaluate(base(monthlyMileage=2400))['monthlyCost']['min']==2*evaluate(base())['monthlyCost']['min']
    assert evaluate(base(installAssessment='passed',parking='fixed',chargingMethod='公司周邊公共充電'))['route']=='public_charging_ready'
    assert set(r['dataSnapshotIds'])==set(r['_sourceSnapshots'])
    class MissingCost:
        def get(self,home): return {'id':'missing','prices':None,'loss':0.1}
    assert evaluate(base(),cost=MissingCost())['monthlyCost']['status']=='unavailable'


def test_tco_comparison_is_directional_and_reproducible():
    values=base(vehicle='RAV4 2018',ownershipYears=7,vehicleAge=8,fuelEfficiencyKmPerL=13.8,
                homeChargingPercent=40,estimatedTradeInValue=200000,plannedOwnershipYears=5,
                homeChargerCost=60000,replacementVehicle='RAV4 2.0')
    tco=evaluate(values)['tcoAnalysis']
    assert tco['status']=='estimated' and len(tco['curves']['years'])==11
    assert set(tco['fiveYearBreakdown'])=={'current','newIce','bz4x'}
    assert tco['fiveYearSavingsVsNewIce']==tco['curves']['newIce'][5]-tco['curves']['bz4x'][5]
    assert tco['annualEnergySavingsRate']>0
    higher_public=evaluate({**values,'homeChargingPercent':fields(homeChargingPercent=0)['homeChargingPercent']})['tcoAnalysis']
    assert higher_public['annualEnergyCost']['bz4x']>tco['annualEnergyCost']['bz4x']


@pytest.mark.parametrize('key,value', [('distance',-1),('monthlyMileage',10001),('parking','wrong'),('vehicle',True),('distance',float('nan'))])
def test_invalid_fields(key,value):
    with pytest.raises(ValueError): Answers(expectedRevision=0,fields=fields(**{key:value}))


@pytest.fixture
def env(tmp_path):
    path=tmp_path/'test.db'; app=create_app(path,demo=True)
    return app,TestClient(app),TestClient(app),path


def start_report(client, values=None):
    s=client.post('/api/v1/sessions',json={}).json()
    response=client.put(f'/api/v1/sessions/{s["id"]}/answers',json={'expectedRevision':0,'fields':values or base(),'questionId':'charging'})
    assert response.status_code==200,response.text
    s=response.json()
    payload={'sessionId':s['id'],'expectedRevision':1}
    response=client.post('/api/v1/evaluations',json=payload,headers={'Idempotency-Key':s['id']})
    assert response.status_code==200,response.text
    return s,response.json()


def test_identity_history_share_and_restart(env):
    app,owner,advisor,path=env; s,r=start_report(owner)
    fid=r['reportFamilyId']; latest=f'/api/v1/report-families/{fid}/latest'
    assert owner.get(f'/api/v1/reports/{r["id"]}?role=advisor').status_code==403
    assert advisor.get(latest).status_code==401
    assert advisor.post('/api/v1/demo/identity').status_code==200
    assert advisor.get(latest+'?role=advisor').status_code==403
    assert owner.post(f'/api/v1/report-families/{fid}/share',json={}).status_code==200
    assert advisor.get('/api/v1/reports').json()[0]['id']==r['id']
    assert advisor.put(f'/api/v1/report-families/{fid}/advisor-note',json={'note':'internal'}).status_code==200
    assert 'advisorNotes' not in owner.get(latest).json()
    assert 'preciseLocations' not in advisor.get(latest+'?role=advisor').json()
    body={'expectedRevision':1,'fields':fields(homeCharging='available')}
    update=advisor.post(f'/api/v1/report-families/{fid}/condition-updates',json=body,headers={'Idempotency-Key':'update'})
    assert update.status_code==200,update.text
    assert update.json()['path']=='green' and update.json()['version']==2
    assert owner.get(f'/api/v1/reports/{r["id"]}').json()==r
    assert owner.get(latest+'?role=line_summary').json()['id']==update.json()['id']
    reboot=TestClient(create_app(path,demo=True)); reboot.cookies.update(owner.cookies)
    assert reboot.get(latest).json()['version']==2
    owner.delete(f'/api/v1/report-families/{fid}/share')
    assert advisor.get(latest+'?role=advisor').status_code==403
    assert advisor.get('/api/v1/reports').json()==[]
    with app.state.repo.transaction() as db:
        assert db.execute('SELECT COUNT(*) FROM source_snapshots').fetchone()[0]>=4


def test_simulation_idempotency_and_isolation(env):
    app,owner,other,_=env; s,r=start_report(owner)
    s2,r2=start_report(other)
    assert s['id']!=s2['id'] and r['id']!=r2['id']
    assert other.get(f'/api/v1/reports/{r["id"]}').status_code==403
    assert other.get(f'/api/v1/sessions/{s["id"]}').status_code==403
    url=f'/api/v1/reports/{r["id"]}/simulate'; payload={'type':'home-charger-approved','value':True}; headers={'Idempotency-Key':'sim'}
    a=owner.post(url,json=payload,headers=headers); b=owner.post(url,json=payload,headers=headers)
    assert a.status_code==200,a.text
    assert a.json()==b.json() and a.json()['kind']=='simulation'
    assert owner.get(f'/api/v1/report-families/{r["reportFamilyId"]}/latest').json()['id']==r['id']
    assert owner.post(url,json={**payload,'value':False},headers=headers).status_code==409
    assert owner.put(f'/api/v1/sessions/{s["id"]}/answers',json={'expectedRevision':0,'fields':{}}).status_code==409
    assert owner.get('/api/v1/reports/missing').status_code==404
    assert owner.post('/api/v1/sessions',json={},headers={'Origin':'https://attacker.test'}).status_code==403


def test_failure_retains_revision_and_retry(env):
    app,owner,_,_=env; s,r=start_report(owner)
    fid=r['reportFamilyId']; url=f'/api/v1/report-families/{fid}/condition-updates'
    def fail(_): raise TimeoutError()
    app.state.engine=fail
    body={'expectedRevision':1,'fields':fields(homeCharging='available')}; headers={'Idempotency-Key':'retry'}
    assert owner.post(url,json=body,headers=headers).status_code==503
    assert owner.get(f'/api/v1/sessions/{s["id"]}').json()['revision']==2
    assert owner.get(f'/api/v1/report-families/{fid}/evaluation-state').json()=={'inputRevision':2,'evaluatedRevision':1,'pending':True}
    assert owner.get(f'/api/v1/report-families/{fid}/latest').json()['id']==r['id']
    app.state.engine=evaluate
    result=owner.post(url,json=body,headers=headers)
    assert result.status_code==200,result.text
    assert result.json()['inputRevision']==2 and result.json()['version']==2
    assert owner.post(url,json=body,headers=headers).json()==result.json()


def test_parallel_expected_revision(env):
    app,owner,_,_=env; s,r=start_report(owner)
    def update(index):
        c=TestClient(app); c.cookies.update(owner.cookies)
        return c.post(f'/api/v1/report-families/{r["reportFamilyId"]}/condition-updates',json={'expectedRevision':1,'fields':fields(homeCharging='available')},headers={'Idempotency-Key':str(index)}).status_code
    with ThreadPoolExecutor(2) as pool: assert sorted(pool.map(update,[1,2]))==[200,409]


def test_production_demo_disabled(tmp_path):
    client=TestClient(create_app(tmp_path/'prod.db',demo=False))
    assert client.post('/api/v1/demo/identity').status_code==403
    assert client.post('/api/v1/demo/reset').status_code==403


def test_provider_error_is_not_empty_coverage():
    class Broken:
        def query(self,*_): return {'id':'failed','status':'provider_error','stations':[]}
    with pytest.raises(ConnectionError): evaluate(base(),charging=Broken())


def test_replay_after_current_rule_change(env, monkeypatch):
    from decision_api.replay import reproduce
    app, owner, _, _ = env
    _, report = start_report(owner)
    monkeypatch.setitem(RULES, 'energyKwhPer100Km', 80)
    core = reproduce(app.state.repo, report['id'])
    assert core['monthlyCost'] == report['monthlyCost']
    for key in core:
        if key not in ('preciseLocations', 'advisorNotes', 'suggestedQuestions'):
            assert core[key] == report[key]


def test_missing_fields_reduce_completeness():
    report = evaluate(fields(vehicle='RAV4'))
    assert report['route'] is None and 0 < report['completeness'] < 100


def test_historical_replay_is_independent_of_current_code(env, monkeypatch):
    import json
    import decision_api.engine as current_engine
    from decision_api.providers import TemplateComposer, SeedCharging
    from decision_api.replay import reproduce
    app, owner, _, _ = env
    _, report = start_report(owner)
    def forbidden(*args, **kwargs):
        raise AssertionError('Historical replay touched current code or live providers')
    monkeypatch.setattr(current_engine, 'evaluate', forbidden)
    monkeypatch.setattr(TemplateComposer, 'compose', forbidden)
    monkeypatch.setattr(SeedCharging, 'query', forbidden)
    assert reproduce(app.state.repo, report['id'])['headline'] == report['headline']
    assert '_execution' not in report
    with app.state.repo.transaction() as db:
        raw = db.execute('SELECT data FROM reports WHERE id=?', (report['id'],)).fetchone()[0]
        stored = json.loads(raw)
        assert stored['_execution']['engineVersion'] == 'rules-0.2.0'
        stored.pop('_execution')  # Reports saved before phase 3 have implicit v0.2 versions.
        db.execute('UPDATE reports SET data=? WHERE id=?', (json.dumps(stored), report['id']))
    assert reproduce(app.state.repo, report['id'])['monthlyCost'] == report['monthlyCost']
    with app.state.repo.transaction() as db:
        stored['_execution'] = {'engineVersion': 'unsupported'}
        db.execute('UPDATE reports SET data=? WHERE id=?', (json.dumps(stored), report['id']))
    with pytest.raises(ValueError, match='Unsupported historical'):
        reproduce(app.state.repo, report['id'])
