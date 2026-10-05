"""Generate complete examples from the actual API in an isolated temporary DB."""
import json
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from decision_api.app import create_app
from test_decision import base

with tempfile.TemporaryDirectory() as temp:
    c=TestClient(create_app(Path(temp)/'examples.db',demo=True))
    s=c.post('/api/v1/sessions',json={}).json()
    request={'contractVersion':'0.2','expectedRevision':0,'questionId':'charging','fields':base()}
    saved=c.put(f'/api/v1/sessions/{s["id"]}/answers',json=request)
    evaluation={'sessionId':s['id'],'expectedRevision':1,'contractVersion':'0.2'}
    report=c.post('/api/v1/evaluations',json=evaluation,headers={'Idempotency-Key':'example-evaluation'}).json()
    simulation={'type':'home-charger-approved','value':True}
    simulated=c.post(f'/api/v1/reports/{report["id"]}/simulate',json=simulation,headers={'Idempotency-Key':'example-simulation'}).json()
    errors=[]
    for method,url,payload in [('GET','/api/v1/reports/missing',None),('GET',f'/api/v1/reports/{report["id"]}?role=advisor',None),('PUT',f'/api/v1/sessions/{s["id"]}/answers',request),('PUT',f'/api/v1/sessions/{s["id"]}/answers',{'expectedRevision':1,'fields':{'invalid':{'value':True,'status':'provided','source':'user','updatedAt':'2026-09-22T00:00:00Z'}}})]:
        result=c.request(method,url,json=payload); errors.append({'method':method,'url':url,'request':payload,'status':result.status_code,'response':result.json()})
    output={'notice':'Generated synthetic examples; IDs are illustrative and not in a running database.','session':s,'answerRequest':request,'answerResponse':saved.json(),'evaluationRequest':evaluation,'driverResponse':report,'simulationRequest':simulation,'simulationResponse':simulated,'errors':errors}
    destination=Path('../../docs/examples-v0.2.json');destination.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
