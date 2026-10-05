"""Generate contracts using recorded public TDX data and a synthetic owner, without network."""
import json,tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from decision_api.app import create_app
from decision_api.refresh_sources import import_recorded
from decision_api.grounded.service import create_grounded_engine,PROFILE_ID
from test_decision import base

def main():
    with tempfile.TemporaryDirectory() as directory:
        app=create_app(Path(directory)/'examples.db',demo=True)
        import_recorded(app.state.repo,Path('.source-cache'))
        app.state.engine=create_grounded_engine(app.state.repo,{'GENERATION_MODE':'template'})
        owner=TestClient(app);advisor=TestClient(app)
        session=owner.post('/api/v1/sessions',json={}).json()
        answers={'expectedRevision':0,'fields':base(homeCharging='available')}
        owner.put(f'/api/v1/sessions/{session["id"]}/answers',json=answers).raise_for_status()
        request={'contractVersion':'0.3','targetVehicleProfileId':PROFILE_ID,'sessionId':session['id'],'expectedRevision':1}
        response=owner.post('/api/v1/evaluations',json=request,headers={'Idempotency-Key':'v03-example'})
        response.raise_for_status();report=response.json();root=f'/api/v1/report-families/{report["reportFamilyId"]}'
        owner.post(root+'/share',json={}).raise_for_status();advisor.post('/api/v1/demo/identity')
        bad=owner.post('/api/v1/evaluations',json={**request,'targetVehicleProfileId':'unsupported'},headers={'Idempotency-Key':'bad'})
        output={'notice':'Synthetic owner and IDs; recorded public TDX cache, not current availability. Template mode; no network or LLM.',
          'answerRequest':answers,'evaluationRequest':request,'driverResponse':report,
          'lineResponse':owner.get(root+'/latest?role=line_summary').json(),
          'advisorResponse':advisor.get(root+'/latest?role=advisor').json(),
          'errors':[{'request':{**request,'targetVehicleProfileId':'unsupported'},'status':bad.status_code,'response':bad.json()}]}
        Path('../../docs/examples-v0.3.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
