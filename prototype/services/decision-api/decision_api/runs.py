"""Persistent leases. All methods run within the caller's short transaction."""
import json
import time
import uuid
from fastapi import HTTPException


class Runs:
    def __init__(self, clock=time.time, lease_seconds=30):
        self.clock, self.lease_seconds = clock, lease_seconds

    def find(self, db, actor, endpoint, key, payload):
        row = db.execute('SELECT * FROM agent_runs WHERE actor=? AND endpoint=? AND request_key=?',
                         (actor, endpoint, key)).fetchone()
        if row is None: return None
        if row['payload'] != payload: raise HTTPException(409, '同一請求鍵的內容不同')
        return dict(row)

    def acquire(self, db, actor, endpoint, key, payload, context, existing=None):
        if existing and existing['status'] == 'pending' and existing['lease_until'] > self.clock():
            raise HTTPException(409, {'code': 'run_in_progress', 'message': '評估進行中，請稍後重試'},
                                headers={'Retry-After': '2'})
        run_id = existing['id'] if existing else 'run-' + uuid.uuid4().hex
        token = uuid.uuid4().hex
        if existing:
            db.execute("UPDATE agent_runs SET status='pending',lease_token=?,lease_until=?,error_code=NULL WHERE id=?",
                       (token, self.clock()+self.lease_seconds, run_id))
        else:
            db.execute('INSERT INTO agent_runs VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                       (run_id, actor, endpoint, key, payload, json.dumps(context, ensure_ascii=False),
                        'pending', token, self.clock()+self.lease_seconds, None, None))
        return run_id, token

    def assert_current(self, db, run_id, token):
        row = db.execute('SELECT * FROM agent_runs WHERE id=?', (run_id,)).fetchone()
        if row is None or row['status'] != 'pending' or row['lease_token'] != token or row['lease_until'] <= self.clock():
            raise HTTPException(409, {'code': 'run_superseded', 'message': '評估已過期，請重試'})

    def complete(self, db, run_id, token, response):
        self.assert_current(db, run_id, token)
        db.execute("UPDATE agent_runs SET status='completed',response=?,lease_until=0 WHERE id=? AND lease_token=?",
                   (json.dumps(response, ensure_ascii=False), run_id, token))

    def fail(self, db, run_id, token, code):
        db.execute("UPDATE agent_runs SET status='failed',error_code=?,lease_until=0 WHERE id=? AND lease_token=? AND status='pending'",
                   (code, run_id, token))
