import asyncio
from datetime import datetime, timezone
from pathlib import Path
from .gemini import GeminiAdapter
from .agent import EvidenceRequest, run_agent
from .cache import CachedTdxProvider
from .contracts import SourceEnvelope, ProfileQuery, ChargingQuery, CostQuery
from .engine import evaluate_grounded, area_code, RULES
from .knowledge import KeywordKnowledge
from .vehicle import OfficialVehicleKnowledge
from .registry import Tool, ToolRegistry

PROFILE_ID='toyota-tw-bz4x-202510-a'


def create_grounded_engine(repo, config, clock=lambda:datetime.now(timezone.utc)):
    def engine(fields):
        now=clock()
        root=Path(__file__).resolve().parents[2]/'knowledge'
        knowledge=KeywordKnowledge.from_file(root/'official-claims.json')
        knowledge.clock=clock
        vehicle=OfficialVehicleKnowledge.from_file(root/'target-profiles.json',knowledge)
        vehicle.clock=clock
        charging=CachedTdxProvider(repo)
        def value(key):return fields.get(key,{}).get('value') if fields.get(key,{}).get('status')=='provided' else None
        registry=ToolRegistry()
        async def vehicle_tool(query):return vehicle.get(query)
        async def charging_tool(query):return charging.query(query)
        async def cost_tool(query):
            return SourceEnvelope.capture(providerVersion='engineering-cost-1',sourceKind='assumption',
                origin='rulebook:grounded-engineering-0.3',retrievedAt=now,sourceUpdatedAt=None,
                coverage='partial',query=query.model_dump(),missingFields=['actual_tariff','parking_fee','service_fee'],
                payload={'home':RULES['homePriceTwdPerKwh'],'public':RULES['publicPriceTwdPerKwh'],
                         'loss':RULES['chargingLossFraction']})
        registry.register(Tool('get_vehicle_profile','1',ProfileQuery,vehicle_tool))
        registry.register(Tool('search_charging_candidates','1',ChargingQuery,charging_tool))
        registry.register(Tool('get_cost_parameters','1',CostQuery,cost_tool))
        query={'areaCode':area_code(value('home') or value('work')),'profileId':PROFILE_ID,
               'window':value('chargingWindow') or 'day'}
        requests=[EvidenceRequest('vehicle','get_vehicle_profile',{'profileId':PROFILE_ID}),
                  EvidenceRequest('charging','search_charging_candidates',query),
                  EvidenceRequest('cost','get_cost_parameters',{'profileId':PROFILE_ID,'chargingMode':'public'})]
        if value('leisure'):
            requests.append(EvidenceRequest('destination','search_charging_candidates',
                {'areaCode':area_code(value('leisure')),'profileId':PROFILE_ID,'window':'day'}))
        # A local attestation is not a billing API: only use a project with billing disabled.
        enabled=(config.get('GENERATION_MODE')=='llm'
                 and config.get('GEMINI_FREE_TIER_CONFIRMED')=='1'
                 and config.get('LLM_MAX_COST_USD')=='0'
                 and config.get('LLM_TEST_BUDGET_USD')=='0'
                 and config.get('LLM_PROVIDER')=='google'
                 and config.get('LLM_MODEL')=='gemini-2.5-flash'
                 and bool(config.get('GEMINI_API_KEY')))
        model=GeminiAdapter(config['GEMINI_API_KEY']) if enabled else None
        def export(evidence):
            # Resolve public/model-approved claims again. Never export submitted fields or notes.
            approved=vehicle.get(ProfileQuery(profileId=PROFILE_ID),for_model=True)
            return {'vehicle':{'claims':approved.payload['citations']},
                    'charging':{'coverage':evidence['charging'].coverage,
                                'snapshotId':evidence['charging'].snapshotId},
                    'cost':{'assumption':True}}
        generated=asyncio.run(run_agent(registry=registry,role='driver',requests=requests,
            evaluate=lambda evidence:evaluate_grounded(fields,evidence,evaluated_at=now),model=model,export_for_model=export,
            max_tokens=min(12000,int(config.get('LLM_MAX_TOKENS',12000)))))
        result=generated['decision']
        result['composition']=generated['composition']
        result['generationMode']=generated['generationMode']
        result['_agentTrace']=generated['metadata']
        return result
    return engine
