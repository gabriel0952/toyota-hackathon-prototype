import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from .models import Answers, Evaluation, Simulation, Note, Share, Start
from .repository import Repository
from .runs import Runs
from .engine import evaluate, RULES, RULE_VERSION
from .engines.v02 import ENGINE_VERSION, COMPOSER_VERSION


def uid(prefix): return prefix + '-' + uuid.uuid4().hex

def now(): return datetime.now(timezone.utc).isoformat()

def dumps(v): return json.dumps(v, ensure_ascii=False, sort_keys=True)


def create_app(db_path=None, demo=None, config=None):
    config=config or {}
    api = FastAPI(title='EV Decision API', version='0.2')
    api.state.repo = Repository(db_path or config.get('DECISION_DB') or os.getenv('DECISION_DB', str(Path(__file__).parent.parent / 'decision.db')))
    api.state.demo = (config.get('LOCAL_DEMO',os.getenv('LOCAL_DEMO')) == '1') if demo is None else demo
    api.state.engine = evaluate
    api.state.grounded = config.get('DECISION_SOURCE_MODE') == 'tdx_cache'
    if api.state.grounded:
        from .grounded.service import create_grounded_engine
        api.state.engine = create_grounded_engine(api.state.repo, config)
    api.state.runs = Runs()
    origins = ['http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:4174']
    api.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'DELETE'], allow_headers=['Content-Type', 'Idempotency-Key'])
    api.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])

    @api.middleware('http')
    async def check_origin(request, call_next):
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('origin')
            # Non-browser clients omit Origin; browser cross-origin mutations must match allowlist.
            if origin and origin not in origins:
                return Response('Origin not allowed', status_code=403)
        return await call_next(request)

    def identity(db, req):
        row = db.execute('SELECT * FROM identities WHERE token=?', (req.cookies.get('ev_identity', ''),)).fetchone()
        if not row: raise HTTPException(401, '請先建立工作階段')
        return dict(row)

    def local_only(req):
        if not api.state.demo or req.client.host not in ('127.0.0.1', '::1', 'testclient'):
            raise HTTPException(403, '僅限本機展示')

    def session(db, sid, actor):
        row = db.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone()
        if not row: raise HTTPException(404, '找不到工作階段')
        if row['owner'] != actor['actor']: raise HTTPException(403, '無存取權限')
        return json.loads(row['data'])

    def access(db, family, actor, owner_only=False):
        row = db.execute('SELECT f.*,s.owner FROM report_families f JOIN sessions s ON f.session_id=s.id WHERE f.id=?', (family,)).fetchone()
        if not row: raise HTTPException(404, '找不到報告')
        if row['owner'] != actor['actor']:
            shared = db.execute('SELECT 1 FROM consents WHERE family=? AND advisor=?', (family, actor['actor'])).fetchone()
            if owner_only or actor['role'] != 'advisor' or not shared: raise HTTPException(403, '尚未取得分享授權')
        return dict(row)

    def projection(db, report, actor, role):
        if role not in ('driver', 'line_summary', 'advisor'): raise HTTPException(422, 'Invalid role')
        if role == 'advisor' and actor['role'] != 'advisor': raise HTTPException(403, '需要顧問身分')
        r = dict(report)
        r.pop('_execution', None)
        r.pop('_evidenceKeys', None)
        r.pop('inputSnapshot', None)
        r.pop('preciseLocations', None)
        if role != 'advisor':
            r.pop('advisorNotes', None); r.pop('suggestedQuestions', None)
        else:
            notes = db.execute('SELECT note FROM advisor_notes WHERE family=?', (r['reportFamilyId'],)).fetchall()
            r['advisorNotes'] = [n['note'] for n in notes]
        if r.get('contractVersion') == '0.3':
            from .grounded.report import DriverReport, AdvisorReport
            (AdvisorReport if role == 'advisor' else DriverReport).model_validate(r)
        return r

    def get_report(db, rid, actor):
        row = db.execute('SELECT data FROM reports WHERE id=?', (rid,)).fetchone()
        if not row: raise HTTPException(404, '找不到此報告版本')
        r = json.loads(row['data']); access(db, r['reportFamilyId'], actor)
        return r

    def idempotent(db, req, actor, payload):
        key = req.headers.get('idempotency-key')
        if not key or len(key) > 200: raise HTTPException(422, '需要 Idempotency-Key')
        row = db.execute('SELECT * FROM idempotency_records WHERE actor=? AND endpoint=? AND key=?', (actor['actor'], req.url.path, key)).fetchone()
        if row and row['payload'] != dumps(payload): raise HTTPException(409, '同一請求鍵的內容不同')
        return key, json.loads(row['response']) if row else None

    def remember(db, req, actor, key, payload, result):
        db.execute('INSERT OR REPLACE INTO idempotency_records VALUES(?,?,?,?,?)', (actor['actor'], req.url.path, key, dumps(payload), dumps(result)))

    def save_fields(db, s, payload, actor):
        if s['revision'] != payload.expectedRevision: raise HTTPException(409, '條件已有新版，請重新載入')
        fields = {k: v.model_dump(mode='json') for k, v in payload.fields.items()}
        for field in fields.values(): field['source'] = 'advisor' if actor['role'] == 'advisor' else 'user'
        s['fields'].update(fields); s['revision'] += 1
        if payload.questionId:
            s['questionIndex'] = max(s['questionIndex'], ['vehicle', 'locations', 'distance', 'charging'].index(payload.questionId) + 1)
            s['answers'] = [a for a in s['answers'] if a['questionId'] != payload.questionId] + [{'questionId': payload.questionId, 'fields': fields}]
        s['vehicle'] = s['fields'].get('vehicle', {}).get('value') or '未提供車款'
        s['ownershipYears'] = s['fields'].get('ownershipYears', {}).get('value') or 0
        db.execute('UPDATE sessions SET revision=?,data=? WHERE id=?', (s['revision'], dumps(s), s['id']))
        db.execute('INSERT INTO answer_revisions VALUES(?,?,?)', (s['id'], s['revision'], dumps(s['fields'])))
        return s

    def make_report(db, s, family, kind, base, result, fields=None):
        inputs = fields if fields is not None else s['fields']
        snapshots = result.pop('_sourceSnapshots', {})
        rule_snapshot = result.pop('_ruleSnapshot', RULES)
        for snapshot_id, snapshot in snapshots.items():
            db.execute('INSERT OR IGNORE INTO source_snapshots VALUES(?,?)', (snapshot_id, dumps(snapshot)))
        version = db.execute('SELECT COALESCE(MAX(version),0)+1 FROM reports WHERE family=?', (family,)).fetchone()[0]
        r = {**result, 'id': uid('report'), 'sessionId': s['id'], 'reportFamilyId': family, 'version': version,
             'createdAt': now(), 'inputRevision': s['revision'], 'kind': kind, 'basedOnReportId': base,
             'changeSummary': [], 'inputSnapshot': inputs,
             '_execution': {'engineVersion': result.get('engineVersion', ENGINE_VERSION), 'composerVersion': result.get('composerVersion', COMPOSER_VERSION)}}
        if base:
            previous = json.loads(db.execute('SELECT data FROM reports WHERE id=?', (base,)).fetchone()[0])
            labels = {'homeCharging':'住家充電','workCharging':'公司充電','installAssessment':'裝樁初評','parking':'停車條件','home':'住家區域','work':'公司區域','leisure':'目的地區域','distance':'通勤距離','tripFrequency':'長途頻率','longDistance':'長途距離','chargingStop':'可停靠時間','monthlyCost':'每月油資','monthlyMileage':'每月里程','vehicle':'車款','vehicleType':'動力類型','ownershipYears':'持有年數','vehicleAge':'目前車齡','fuelEfficiencyKmPerL':'平均油耗','homeChargingPercent':'居家充電比例','estimatedTradeInValue':'預估換購價','plannedOwnershipYears':'預計持有期間','homeChargerCost':'家充建置費','replacementVehicle':'比較油車','chargingMethod':'補電偏好','chargingWindow':'補電時段'}
            values = {'available':'已可使用','unavailable':'無法使用','passed':'初評通過','failed':'無法安裝','fixed':'固定車位','street':'無固定車位','day':'白天','night':'夜間',None:'待確認'}
            def show(field): return '不適用' if field.get('status') == 'not_applicable' else str(values.get(field.get('value'),field.get('value')))
            r['changeSummary'] = [f'{labels.get(k,k)}：{show(previous["inputSnapshot"].get(k, {}))} → {show(v)}' for k, v in inputs.items() if previous['inputSnapshot'].get(k, {}).get('value') != v.get('value') or previous['inputSnapshot'].get(k, {}).get('status') != v.get('status')]
        db.execute('INSERT INTO reports VALUES(?,?,?,?,?)', (r['id'], family, version, kind, dumps(r)))
        db.execute('INSERT OR IGNORE INTO source_snapshots VALUES(?,?)', (r['ruleVersion'], dumps(rule_snapshot)))
        if kind == 'actual':
            db.execute('UPDATE report_families SET latest=? WHERE id=?', (r['id'], family))
            s['reportId'] = r['id']; s['reportFamilyId'] = family
            db.execute('UPDATE sessions SET data=? WHERE id=?', (dumps(s), s['id']))
        return r

    @api.get('/api/v1/health')
    def health(): return {'ok': True, 'contractVersion': '0.3' if api.state.grounded else '0.2'}

    @api.post('/api/v1/demo/identity')
    def bootstrap(req: Request, response: Response):
        local_only(req)
        token = secrets.token_urlsafe(32)
        with api.state.repo.transaction() as db: db.execute('INSERT INTO identities VALUES(?,?,?)', (token, 'demo-advisor', 'advisor'))
        response.set_cookie('ev_identity', token, httponly=True, samesite='strict')
        return {'actor': 'demo-advisor', 'role': 'advisor'}

    @api.post('/api/v1/sessions')
    def start(body: Start, req: Request, response: Response):
        with api.state.repo.transaction() as db:
            try: actor = identity(db, req)
            except HTTPException:
                token = secrets.token_urlsafe(32); actor = {'actor': uid('owner'), 'role': 'driver'}
                db.execute('INSERT INTO identities VALUES(?,?,?)', (token, actor['actor'], actor['role']))
                response.set_cookie('ev_identity', token, httponly=True, samesite='strict')
            if actor['role'] != 'driver': raise HTTPException(403, '顧問請使用車主分享的報告')
            sid, family = uid('session'), uid('family')
            s = {'id': sid, 'vehicle': '未提供車款', 'ownershipYears': 0, 'questionIndex': 0, 'revision': 0, 'fields': {}, 'answers': [], 'reportFamilyId': family}
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (sid, actor['actor'], 0, dumps(s)))
            db.execute('INSERT INTO answer_revisions VALUES(?,?,?)', (sid, 0, '{}'))
            db.execute('INSERT INTO report_families VALUES(?,?,NULL)', (family, sid))
            return s

    @api.get('/api/v1/sessions/{sid}')
    def restore(sid: str, req: Request):
        with api.state.repo.transaction() as db: return session(db, sid, identity(db, req))

    @api.put('/api/v1/sessions/{sid}/answers')
    def answers(sid: str, body: Answers, req: Request):
        with api.state.repo.transaction() as db:
            actor = identity(db, req)
            return save_fields(db, session(db, sid, actor), body, actor)

    @api.get('/api/v1/sessions/{sid}/next-question')
    def next_question(sid: str, req: Request):
        with api.state.repo.transaction() as db:
            s = session(db, sid, identity(db, req))
            return {'index': s['questionIndex']}

    def execute_report(req, payload, prepare):
        # Reserve inputs/lease in one short transaction. No network calls here.
        encoded = dumps(payload)
        with api.state.repo.transaction() as db:
            actor = identity(db, req)
            key, old = idempotent(db, req, actor, payload)
            existing = api.state.runs.find(db, actor['actor'], req.url.path, key, encoded)
            if existing:
                context = json.loads(existing['context'])
                access(db, context['family'], actor)
                if existing['status'] == 'completed':
                    return json.loads(existing['response'])
            else:
                context = prepare(db, actor, old)
                if old and not old.get('_pending'):
                    return old
            current = db.execute('SELECT revision FROM sessions WHERE id=?', (context['session']['id'],)).fetchone()[0]
            if current != context['expectedRevision']:
                raise HTTPException(409, '條件已有新版，請重新載入')
            run_id, token = api.state.runs.acquire(db, actor['actor'], req.url.path, key, encoded, context, existing)
        try:
            # Tools/model must have their own bounded deadline below the run lease.
            result = api.state.engine(context['fields'])
            trace = result.pop('_agentTrace', None)
            with api.state.repo.transaction() as db:
                current_actor = identity(db, req)
                if current_actor['actor'] != actor['actor']:
                    raise HTTPException(403, '身分已變更')
                api.state.runs.assert_current(db, run_id, token)
                family = access(db, context['family'], current_actor)
                row = db.execute('SELECT revision,data FROM sessions WHERE id=?', (context['session']['id'],)).fetchone()
                if row['revision'] != context['expectedRevision']:
                    raise HTTPException(409, '條件已有新版，過期評估不會發布')
                # Refresh session metadata so publication cannot undo concurrent edits.
                session_data = json.loads(row['data'])
                if context['kind'] == 'simulation':
                    session_data['revision'] = context['session']['revision']
                base = family['latest'] if context['kind'] == 'actual' else context['base']
                report = make_report(db, session_data, context['family'], context['kind'], base, result, context['fields'])
                if trace is not None:
                    from .grounded.trace import RunTrace
                    db.execute('INSERT OR REPLACE INTO agent_traces VALUES(?,?)', (run_id, RunTrace.model_validate(trace).model_dump_json()))
                response = projection(db, report, current_actor, context['role'])
                remember(db, req, current_actor, key, payload, response)
                api.state.runs.complete(db, run_id, token, response)
                return response
        except Exception as exc:
            with api.state.repo.transaction() as db:
                api.state.runs.fail(db, run_id, token, 'publish_rejected' if isinstance(exc, HTTPException) else 'evaluation_failed')
            if isinstance(exc, HTTPException): raise
            raise HTTPException(503, '評估暫不可用；已保存條件與原報告，請重試同一操作') from None

    @api.post('/api/v1/evaluations')
    def evaluation(body: Evaluation, req: Request):
        def prepare(db, actor, old):
            s = session(db, body.sessionId, actor)
            f = access(db, s['reportFamilyId'], actor)
            if not old and s['revision'] != body.expectedRevision:
                raise HTTPException(409, '條件已有新版')
            return {'session': s, 'family': f['id'], 'expectedRevision': s['revision'],
                    'fields': s['fields'], 'kind': 'actual', 'base': f['latest'], 'role': 'driver'}
        return execute_report(req, body.model_dump(mode='json'), prepare)

    @api.get('/api/v1/reports')
    def reports(req: Request, role: str = 'advisor'):
        with api.state.repo.transaction() as db:
            actor = identity(db, req); out = []
            for row in db.execute('SELECT id,latest FROM report_families WHERE latest IS NOT NULL').fetchall():
                try: access(db, row['id'], actor)
                except HTTPException: continue
                out.append(projection(db, get_report(db, row['latest'], actor), actor, role))
            if role == 'advisor' and actor['role'] != 'advisor': raise HTTPException(403, '需要顧問身分')
            return out

    @api.get('/api/v1/reports/{rid}')
    def report(rid: str, req: Request, role: str = 'driver'):
        with api.state.repo.transaction() as db:
            actor = identity(db, req); return projection(db, get_report(db, rid, actor), actor, role)

    @api.get('/api/v1/report-families/{fid}/latest')
    def latest(fid: str, req: Request, role: str = 'driver'):
        with api.state.repo.transaction() as db:
            actor = identity(db, req); f = access(db, fid, actor)
            if not f['latest']: raise HTTPException(404, '尚無評估報告')
            return projection(db, get_report(db, f['latest'], actor), actor, role)

    @api.get('/api/v1/report-families/{fid}/evaluation-state')
    def evaluation_state(fid: str, req: Request):
        with api.state.repo.transaction() as db:
            actor = identity(db, req); f = access(db, fid, actor)
            revision = db.execute('SELECT revision FROM sessions WHERE id=?', (f['session_id'],)).fetchone()[0]
            evaluated = get_report(db, f['latest'], actor)['inputRevision'] if f['latest'] else None
            return {'inputRevision': revision, 'evaluatedRevision': evaluated, 'pending': revision != evaluated}

    @api.get('/api/v1/report-families/{fid}/versions')
    def versions(fid: str, req: Request, role: str = 'driver'):
        with api.state.repo.transaction() as db:
            actor = identity(db, req); access(db, fid, actor)
            return [projection(db, json.loads(r['data']), actor, role) for r in db.execute('SELECT data FROM reports WHERE family=? ORDER BY version', (fid,)).fetchall()]

    @api.post('/api/v1/reports/{rid}/simulate')
    def simulate(rid: str, body: Simulation, req: Request):
        def prepare(db, actor, old):
            base = get_report(db, rid, actor)
            s = json.loads(db.execute('SELECT data FROM sessions WHERE id=?', (base['sessionId'],)).fetchone()[0])
            expected = s['revision']
            s['revision'] = base['inputRevision']
            fields = dict(base['inputSnapshot'])
            fields['homeCharging'] = {'value': 'available' if body.value else 'unavailable', 'source': 'advisor' if actor['role'] == 'advisor' else 'user', 'status': 'provided', 'updatedAt': now()}
            return {'session': s, 'family': base['reportFamilyId'], 'expectedRevision': expected,
                    'fields': fields, 'kind': 'simulation', 'base': rid, 'role': 'driver'}
        return execute_report(req, body.model_dump(mode='json'), prepare)

    @api.post('/api/v1/report-families/{fid}/condition-updates')
    def update(fid: str, body: Answers, req: Request):
        def prepare(db, actor, old):
            f = access(db, fid, actor)
            s = json.loads(db.execute('SELECT data FROM sessions WHERE id=?', (f['session_id'],)).fetchone()[0])
            if old:
                if old.get('_pending') and old['revision'] != s['revision']:
                    raise HTTPException(409, '條件已有新版，請重新載入')
            else:
                s = save_fields(db, s, body, actor)
            return {'session': s, 'family': fid, 'expectedRevision': s['revision'],
                    'fields': s['fields'], 'kind': 'actual', 'base': f['latest'], 'role': actor['role']}
        return execute_report(req, body.model_dump(mode='json'), prepare)

    @api.post('/api/v1/report-families/{fid}/share')
    def share(fid: str, body: Share, req: Request):
        with api.state.repo.transaction() as db:
            actor = identity(db, req); access(db, fid, actor, True)
            db.execute('INSERT OR IGNORE INTO consents VALUES(?,?)', (fid, body.advisorId))
            return {'shared': True}

    @api.delete('/api/v1/report-families/{fid}/share')
    def revoke(fid: str, req: Request):
        with api.state.repo.transaction() as db:
            access(db, fid, identity(db, req), True)
            db.execute('DELETE FROM consents WHERE family=?', (fid,)); return {'shared': False}

    @api.put('/api/v1/report-families/{fid}/advisor-note')
    def note(fid: str, body: Note, req: Request):
        with api.state.repo.transaction() as db:
            actor = identity(db, req); access(db, fid, actor)
            if actor['role'] != 'advisor': raise HTTPException(403, '需要顧問身分')
            db.execute('INSERT OR REPLACE INTO advisor_notes VALUES(?,?,?)', (fid, actor['actor'], body.note)); return {'saved': True}

    @api.post('/api/v1/demo/reset')
    def reset(req: Request, response: Response):
        local_only(req)
        # Reset only this identity's browser login; never delete other users' reports.
        with api.state.repo.transaction() as db:
            db.execute('DELETE FROM identities WHERE token=?', (req.cookies.get('ev_identity', ''),))
        response.delete_cookie('ev_identity'); return {'reset': True}
    return api


def configured_app():
    from .tdx_probe import load_environment
    env_path=Path(__file__).resolve().parent.parent/'.env'
    return create_app(config=load_environment(env_path if env_path.exists() else None))


app = configured_app()
