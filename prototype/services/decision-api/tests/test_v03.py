import json
from datetime import datetime, timedelta
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from decision_api.app import create_app
from decision_api.grounded.contracts import SourceEnvelope
from decision_api.grounded.service import create_grounded_engine, PROFILE_ID
from decision_api.grounded.report import DriverReport
from decision_api.models import Evaluation
from decision_api.replay import reproduce
from test_decision import start_report, fields, base


@pytest.fixture
def v03(tmp_path, monkeypatch):
    claims=json.loads((Path(__file__).parents[1]/'knowledge/official-claims.json').read_text())
    clock=datetime.fromisoformat(claims['claims'][0]['retrievedAt'].replace('Z','+00:00'))+timedelta(seconds=1)
    app=create_app(tmp_path/'v03.db',demo=True)
    def unavailable_model(*args,**kwargs):raise AssertionError('Zero-paid path called Gemini')
    monkeypatch.setattr('decision_api.grounded.gemini.GeminiAdapter.turn',unavailable_model)
    app.state.engine=create_grounded_engine(app.state.repo,{'GENERATION_MODE':'llm','LLM_MAX_COST_USD':'0'},clock=lambda:clock)
    stations=[{'id':key,'name':'合成測試站 '+key,'areaCode':'63000100',
               'connectors':[{'id':key+'-1','standard':'SAE_J1772'}],'windows':['day','night']} for key in ('a','b')]
    source=SourceEnvelope.capture(providerVersion='synthetic-normalized-1',sourceKind='demo',origin='synthetic:test',
        retrievedAt=clock,sourceUpdatedAt=clock,coverage='complete',query={'areaCode':'63000100'},payload={'stations':stations})
    app.state.repo.save_source(source,'tdx:normalized:63000100')
    return app,TestClient(app),clock,source


def test_three_channel_report_is_persisted_private_and_replayable(v03):
    app,owner,_,_=v03
    session,report=start_report(owner)
    assert report['contractVersion']=='0.3' and report['generationMode']=='template'
    assert report['targetVehicleProfileId']==PROFILE_ID and report['vehicle']=='RAV4'
    DriverReport.model_validate(report)
    fid=report['reportFamilyId']
    advisor=TestClient(app);advisor.post('/api/v1/demo/identity')
    owner.post(f'/api/v1/report-families/{fid}/share',json={})
    advisor.put(f'/api/v1/report-families/{fid}/advisor-note',json={'note':'PRIVATE'})
    shared=advisor.get(f'/api/v1/report-families/{fid}/latest?role=advisor').json()
    line=owner.get(f'/api/v1/report-families/{fid}/latest?role=line_summary').json()
    assert line==report
    assert shared['advisorNotes']==['PRIVATE']
    for key in ('id','route','monthlyCost','sources','composition'):
        assert shared[key]==report[key]
    assert '_agentTrace' not in report and '_evidenceKeys' not in report and '_execution' not in report
    replay=reproduce(app.state.repo,report['id'])
    for key,value in replay.items():
        if key not in ('preciseLocations','advisorNotes','suggestedQuestions'):
            assert value==report[key],key
    with app.state.repo.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM agent_traces').fetchone()[0]==1
    app.state.engine=lambda _: (_ for _ in ()).throw(AssertionError('read regenerated report'))
    assert owner.get(f'/api/v1/reports/{report["id"]}').json()==report


def test_source_failure_preserves_pending_revision_and_old_report(v03):
    app,owner,_,_=v03
    _,report=start_report(owner)
    with app.state.repo.transaction() as db:db.execute('DELETE FROM normalized_cache')
    root=f'/api/v1/report-families/{report["reportFamilyId"]}'
    response=owner.post(root+'/condition-updates',json={'expectedRevision':1,'fields':fields(homeCharging='available')},
                        headers={'Idempotency-Key':'missing-cache'})
    assert response.status_code==503
    assert owner.get(root+'/latest').json()==report
    assert owner.get(root+'/evaluation-state').json()['pending'] is True


def test_refresh_does_not_publish_and_stale_cache_does_not_pass_public_route(v03):
    app,owner,clock,source=v03
    _,original=start_report(owner)
    body=source.model_dump(mode='json',exclude={'snapshotId','contentHash'})
    body.update(retrievedAt=clock+timedelta(seconds=1),sourceUpdatedAt=clock-timedelta(days=2))
    app.state.repo.save_source(SourceEnvelope.capture(**body),'tdx:normalized:63000100')
    root=f'/api/v1/report-families/{original["reportFamilyId"]}'
    assert owner.get(root+'/latest').json()==original
    response=owner.post(root+'/condition-updates',json={'expectedRevision':1,'fields':fields(distance=20)},headers={'Idempotency-Key':'stale'})
    assert response.status_code==200,response.text
    assert response.json()['route'] is None
    assert any(s['freshness']=='stale' for s in response.json()['sources'])


def test_v03_target_required_and_long_trips_not_inferred(v03):
    with pytest.raises(ValueError):Evaluation(contractVersion='0.3',sessionId='s',expectedRevision=0)
    assert Evaluation(sessionId='s',expectedRevision=0).model_dump().get('targetVehicleProfileId') is None
    app,owner,_,_=v03
    # v0.4: a trip reachable one-way (≤ usable range) is judged by destination charging, not held back.
    _,report=start_report(owner,base(homeCharging='available',tripFrequency='每週',longDistance=180,chargingStop=30,leisure='台北市內湖區'))
    assert report['engineVersion']=='grounded-rules-0.4.0'
    assert any(j['label']=='長途返鄉／出遊' and '單程 180' in j['title'] for j in report['journeys'])
    # Beyond the usable range the trip needs en-route charging, which is not assessed yet.
    _,report=start_report(owner,base(homeCharging='available',tripFrequency='每週',longDistance=420,chargingStop=30,leisure='台北市內湖區'))
    assert report['route'] is None and report['path'] is None
    assert any('長途沿途' in p for p in report['pendingConfirmations'])


def test_free_tier_requires_explicit_zero_paid_attestation(v03,monkeypatch):
    from decision_api.grounded.gemini import ModelTurn, ModelFailure
    app,owner,clock,_=v03
    calls=[]
    async def model(self,contents,schemas,**kwargs):
        calls.append(contents)
        finish={'name':'finish_report','args':{'actionCodes':[],'citationIds':[],'phraseCodes':['review_evidence']}}
        return ModelTurn([finish],{'role':'model','parts':[{'functionCall':finish}]},100,20,'test-model')
    monkeypatch.setattr('decision_api.grounded.gemini.GeminiAdapter.turn',model)
    config={'GENERATION_MODE':'llm','GEMINI_FREE_TIER_CONFIRMED':'1','LLM_MAX_COST_USD':'0',
            'LLM_TEST_BUDGET_USD':'0','LLM_PROVIDER':'google','LLM_MODEL':'gemini-2.5-flash','GEMINI_API_KEY':'synthetic'}
    for override in ({'GEMINI_FREE_TIER_CONFIRMED':'0'},{'LLM_MAX_COST_USD':'1'},{'LLM_TEST_BUDGET_USD':'1'}):
        assert create_grounded_engine(app.state.repo,{**config,**override},clock=lambda:clock)(base())['generationMode']=='template'
    assert calls==[]
    app.state.engine=create_grounded_engine(app.state.repo,config,clock=lambda:clock)
    _,report=start_report(owner)
    assert report['generationMode']=='llm' and len(calls)==1
    assert 'RAV4' not in str(calls) and 'privateNotes' not in str(calls)
    owner.get(f'/api/v1/reports/{report["id"]}')
    assert len(calls)==1
    async def fail(*args,**kwargs):raise ModelFailure('model_timeout')
    monkeypatch.setattr('decision_api.grounded.gemini.GeminiAdapter.turn',fail)
    fallback=app.state.engine(base())
    assert fallback['generationMode']=='template'
    assert fallback['route']==report['route']


def test_v03_replay_does_not_use_current_engine(v03,monkeypatch):
    app,owner,_,_=v03
    _,report=start_report(owner)
    def fail(*args,**kwargs):raise AssertionError('Used current engine')
    monkeypatch.setattr('decision_api.grounded.engine.evaluate_grounded',fail)
    monkeypatch.setattr('decision_api.grounded.planning.plan_charging',fail)
    assert reproduce(app.state.repo,report['id'])['route']==report['route']
