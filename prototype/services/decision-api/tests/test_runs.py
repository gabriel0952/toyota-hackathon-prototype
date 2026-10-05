import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest
from fastapi.testclient import TestClient
from decision_api.app import create_app
from decision_api.engine import evaluate
from decision_api.repository import Repository, SCHEMA
from test_decision import base, fields, start_report
from test_grounded_tools import source


def setup(tmp_path):
    app = create_app(tmp_path/'runs.db', demo=True)
    owner, advisor = TestClient(app), TestClient(app)
    session, report = start_report(owner)
    advisor.post('/api/v1/demo/identity')
    owner.post(f'/api/v1/report-families/{report["reportFamilyId"]}/share', json={})
    return app, owner, advisor, session, report


def slow_engine(app):
    entered, release = Event(), Event()
    def slow(inputs):
        entered.set()
        assert release.wait(5), 'Test failed to release engine'
        return evaluate(inputs)
    app.state.engine = slow
    return entered, release


def test_migration_backup_restore_and_unknown_version(tmp_path):
    path = tmp_path/'legacy.db'
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        db.execute('INSERT INTO reports VALUES(?,?,?,?,?)', ('old', 'f', 1, 'actual', '{"original":true}'))
    repo = Repository(path)
    with repo.connect() as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == 2
        assert db.execute('SELECT data FROM reports WHERE id="old"').fetchone()[0] == '{"original":true}'
        assert len(db.execute("SELECT name FROM sqlite_master WHERE name IN ('source_manifests','normalized_cache','agent_runs','agent_traces')").fetchall()) == 4
    with sqlite3.connect(str(path)+'-pre-v2.backup') as backup:
        assert backup.execute('PRAGMA user_version').fetchone()[0] == 1
        assert backup.execute('SELECT COUNT(*) FROM reports').fetchone()[0] == 1
    restored = tmp_path/'restored.db'
    repo.backup(restored)
    with Repository(restored).connect() as db:
        assert db.execute('SELECT data FROM reports').fetchone()[0] == '{"original":true}'
        db.execute('PRAGMA user_version=99')
    with pytest.raises(RuntimeError, match='newer'): Repository(restored)


def test_source_manifest_storage_and_private_trace_validation(tmp_path):
    from pydantic import ValidationError
    app, _, _, _, _ = setup(tmp_path)
    repo = app.state.repo
    envelope = source()
    repo.save_source(envelope, 'pilot')
    envelope.payload['stations'].append('caller mutation')
    assert repo.read_source(envelope.snapshotId).payload['stations'] == []
    manifest = {'claims': []}
    mid = repo.save_manifest(manifest)
    assert repo.read_manifest(mid) == manifest
    with repo.connect() as db:
        run_id = db.execute('SELECT id FROM agent_runs LIMIT 1').fetchone()[0]
    trace = {'rounds':0, 'tokens':0, 'durationMs':1, 'modelVersion':None,
             'error':'template_configured','tools':[]}
    repo.save_trace(run_id, trace)
    with pytest.raises(ValidationError):
        repo.save_trace(run_id, {**trace, 'reasoning':'SECRET'})


def test_new_revision_can_save_while_tool_runs_and_stale_result_cannot_publish(tmp_path):
    app, owner, _, session, report = setup(tmp_path)
    entered, release = slow_engine(app)
    url = f'/api/v1/report-families/{report["reportFamilyId"]}/condition-updates'
    payload = {'expectedRevision': 1, 'fields': fields(homeCharging='available')}
    with ThreadPoolExecutor() as pool:
        running = pool.submit(owner.post, url, json=payload, headers={'Idempotency-Key':'slow'})
        try:
            assert entered.wait(2)
            duplicate = owner.post(url, json=payload, headers={'Idempotency-Key':'slow'})
            assert duplicate.status_code == 409 and duplicate.json()['detail']['code'] == 'run_in_progress'
            changed = owner.put(f'/api/v1/sessions/{session["id"]}/answers', json={'expectedRevision':2,'fields':fields(distance=25)})
            assert changed.status_code == 200
        finally: release.set()
        assert running.result().status_code == 409
    latest = owner.get(f'/api/v1/report-families/{report["reportFamilyId"]}/latest').json()
    assert latest['id'] == report['id']


def test_revoke_during_advisor_run_blocks_publication_and_leaks_no_response(tmp_path):
    app, owner, advisor, _, report = setup(tmp_path)
    entered, release = slow_engine(app)
    root = f'/api/v1/report-families/{report["reportFamilyId"]}'
    payload = {'expectedRevision':1,'fields':fields(homeCharging='available')}
    with ThreadPoolExecutor() as pool:
        running = pool.submit(advisor.post, root+'/condition-updates', json=payload, headers={'Idempotency-Key':'revoked'})
        try:
            assert entered.wait(2)
            assert owner.delete(root+'/share').status_code == 200
        finally: release.set()
        assert running.result().status_code == 403
    assert owner.get(root+'/latest').json()['id'] == report['id']
    assert advisor.post(root+'/condition-updates', json=payload, headers={'Idempotency-Key':'revoked'}).status_code == 403


def test_expired_lease_recovery_fences_original_process_and_reuses_report(tmp_path):
    app, owner, _, _, report = setup(tmp_path)
    entered, release = slow_engine(app)
    clock = [100.0]
    app.state.runs.clock = lambda: clock[0]
    root = f'/api/v1/report-families/{report["reportFamilyId"]}'
    payload = {'expectedRevision':1,'fields':fields(homeCharging='available')}
    with ThreadPoolExecutor() as pool:
        running = pool.submit(owner.post, root+'/condition-updates', json=payload, headers={'Idempotency-Key':'recovered'})
        try:
            assert entered.wait(2)
            clock[0] += 31
            # A restarted service sees the persisted context and expired lease.
            restarted = create_app(app.state.repo.path, demo=True)
            restarted.state.runs.clock = lambda: clock[0]
            client = TestClient(restarted)
            client.cookies.update(owner.cookies)
            recovered = client.post(root+'/condition-updates', json=payload, headers={'Idempotency-Key':'recovered'})
            assert recovered.status_code == 200, recovered.text
        finally: release.set()
        assert running.result().status_code == 409
    again = client.post(root+'/condition-updates', json=payload, headers={'Idempotency-Key':'recovered'})
    assert again.json()['id'] == recovered.json()['id']
    assert len(client.get(root+'/versions').json()) == 2
    with restarted.state.repo.connect() as db:
        row = db.execute("SELECT context,status FROM agent_runs WHERE request_key='recovered'").fetchone()
        assert row['status'] == 'completed'
        assert json.loads(row['context'])['expectedRevision'] == 2
