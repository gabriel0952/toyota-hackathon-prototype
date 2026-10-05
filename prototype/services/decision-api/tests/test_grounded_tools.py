import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from pathlib import Path
from pydantic import ValidationError
from decision_api.grounded.contracts import SourceEnvelope, ProfileQuery, KnowledgeQuery, digest
from decision_api.grounded.registry import Tool, ToolRegistry, ToolRejected
from decision_api.grounded.knowledge import KeywordKnowledge
from decision_api.grounded.vehicle import TargetProfile, OfficialVehicleKnowledge

NOW=datetime(2026,9,22,tzinfo=timezone.utc)


def source(**kwargs):
    return SourceEnvelope.capture(**dict(dict(providerVersion='recorded-test-1',sourceKind='demo',origin='synthetic:test',retrievedAt=NOW,sourceUpdatedAt=NOW,coverage='complete',query={'profileId':'tw-test'},payload={'stations':[]}),**kwargs))


def claim(**kwargs):
    body=dict(id='test-claim',topic='charging',profileIds=['tw-test'],market='TW',text='Synthetic charging claim',keywords=['charging','充電'],origin='synthetic:test',locator='test section',retrievedAt='2026-09-22T00:00:00Z',sourceUpdatedAt=None,validUntil='2026-10-22T00:00:00Z',reviewStatus='reviewed',reviewedBy='test',allowedRoles=['driver','advisor'],externalModelAllowed=True)
    body.update(kwargs)
    return {**body,'contentHash':digest(body)}


def test_snapshot_integrity_and_freshness():
    a=source(); b=source()
    assert a.snapshotId==b.snapshotId
    assert a.freshness_at(NOW+timedelta(seconds=300),300)=='fresh'
    assert a.freshness_at(NOW+timedelta(seconds=301),300)=='stale'
    assert source(sourceUpdatedAt=None).freshness_at(NOW,300)=='unknown'
    assert source(sourceUpdatedAt=NOW+timedelta(days=1)).freshness_at(NOW,300)=='unknown'
    tampered=a.model_dump(mode='json');tampered['payload']['stations']=['fake']
    with pytest.raises(ValidationError): SourceEnvelope.model_validate(tampered)
    with pytest.raises(ValidationError): source(retrievedAt='not a date')


def test_unknown_partial_and_failed_tool_contract():
    for status in ['complete','partial','none']:
        assert source(coverage=status).coverage==status
    with pytest.raises(ValidationError): source(coverage='pretend_verified')
    with pytest.raises(ValidationError): source(sourceKind='unverified_live')


def test_tool_permissions_validation_timeout_and_dedup():
    async def run():
        calls=[]
        async def handler(args): calls.append(args.profileId);return source()
        async def slow(args): await asyncio.sleep(0.03);return source()
        async def failed(args): raise RuntimeError('SECRET=value')
        registry=ToolRegistry()
        registry.register(Tool('vehicle','1',ProfileQuery,handler))
        registry.register(Tool('private','1',ProfileQuery,handler,roles={'advisor'}))
        registry.register(Tool('slow','1',ProfileQuery,slow,timeout_seconds=.001))
        registry.register(Tool('failed','1',ProfileQuery,failed))
        session=registry.session('driver')
        a=await session.call('vehicle',{'profileId':'tw-test'})
        a.payload['stations'].append('mutated by caller')
        assert (await session.call('vehicle',{'profileId':'tw-test'})).payload['stations']==[]
        assert calls==['tw-test']
        for name,args,error in [('private',{'profileId':'tw-test'},'tool_not_allowed'),('execute_url',{},'tool_not_allowed'),('vehicle',{'profileId':'test','privateNotes':'secret'},'invalid_arguments'),('slow',{'profileId':'test'},'tool_timeout'),('failed',{'profileId':'test'},'invalid_or_failed_tool')]:
            with pytest.raises(ToolRejected,match=error): await session.call(name,args)
        assert 'SECRET' not in str(session.trace) and 'privateNotes' not in str(session.trace)
        assert 'private' not in [t['name'] for t in registry.schemas('driver')]
        limited=registry.session('driver',max_calls=1)
        await limited.call('vehicle',{'profileId':'test'})
        with pytest.raises(ToolRejected,match='budget_exceeded'):await limited.call('vehicle',{'profileId':'test'})
    asyncio.run(run())


def test_keyword_retrieval_enforces_review_scope_and_time():
    claims=[claim(),claim(id='private',allowedRoles=['advisor'],externalModelAllowed=False),claim(id='pending',reviewStatus='pending'),claim(id='conflicting',reviewStatus='conflict'),claim(id='other',profileIds=['other']),claim(id='expired',validUntil='2026-09-22T00:00:00Z')]
    retriever=KeywordKnowledge(claims,clock=lambda:NOW+timedelta(seconds=1))
    q=KnowledgeQuery(profileId='tw-test',topic='charging',query='充電')
    assert [c['id'] for c in retriever.search(q,'driver').payload['claims']]==['test-claim']
    assert [c['id'] for c in retriever.search(q,'advisor').payload['claims']]==['private','test-claim']
    assert [c['id'] for c in retriever.search(q,'advisor',for_model=True).payload['claims']]==['test-claim']
    with pytest.raises(KeyError): retriever.resolve('private',q,'driver')
    assert retriever.search(KnowledgeQuery(profileId='unknown',topic='warranty',query=''), 'driver').missingFields==['reviewed_applicable_claim']
    bad=claim();bad['text']='tampered'
    with pytest.raises(ValidationError):KeywordKnowledge([bad])
    with pytest.raises(ValueError):KeywordKnowledge([claim(),claim()])


def test_official_manifest_is_valid_and_unreviewed_profile_cannot_be_enabled():
    root = Path(__file__).resolve().parents[1] / 'knowledge'
    knowledge = KeywordKnowledge.from_file(root / 'official-claims.json')
    provider = OfficialVehicleKnowledge.from_file(root / 'target-profiles.json', knowledge)
    q = ProfileQuery(profileId='toyota-tw-bz4x-202510-a')
    assert provider.get(q).payload['profile']['dcConnector'] == 'CCS1'
    pending=provider.profiles[q.profileId].model_dump(mode='json')
    pending['reviewStatus']='pending'
    pending['contentHash']=digest({k:v for k,v in pending.items() if k!='contentHash'})
    unreviewed=OfficialVehicleKnowledge([pending],knowledge)
    with pytest.raises(ValueError, match='not reviewed'):unreviewed.get(q)


def test_profile_claim_review_is_rechecked_and_missing_connectors_remain_unknown():
    body = dict(id='tw-test', market='TW', model='test', specificationCode='synthetic',
                applicableProductionFrom='2025-10-01', reviewStatus='reviewed', reviewedBy='test',
                acConnector=None, dcConnector='CCS1', claimIds=['test-claim'])
    profile = TargetProfile.model_validate({**body, 'contentHash': digest(body)})
    knowledge = KeywordKnowledge([claim(topic='bz4x')], clock=lambda: NOW)
    provider = OfficialVehicleKnowledge([profile], knowledge, clock=lambda: NOW)
    result = provider.get(ProfileQuery(profileId='tw-test'))
    assert result.coverage == 'partial' and result.missingFields == ['acConnector']
    assert result.payload['profile']['dcConnector'] == 'CCS1'
    restricted = KeywordKnowledge([claim(topic='bz4x', externalModelAllowed=False)], clock=lambda: NOW)
    restricted_provider = OfficialVehicleKnowledge([profile], restricted, clock=lambda: NOW)
    assert restricted_provider.get(ProfileQuery(profileId='tw-test')).coverage == 'partial'
    with pytest.raises(KeyError):
        restricted_provider.get(ProfileQuery(profileId='tw-test'), for_model=True)
    knowledge.clock = lambda: NOW + timedelta(days=31)
    with pytest.raises(KeyError):
        provider.get(ProfileQuery(profileId='tw-test'))
