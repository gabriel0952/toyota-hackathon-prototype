import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager, closing

SCHEMA = '''
CREATE TABLE IF NOT EXISTS identities(token TEXT PRIMARY KEY, actor TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS answer_revisions(session_id TEXT, revision INTEGER, data TEXT NOT NULL, PRIMARY KEY(session_id,revision));
CREATE TABLE IF NOT EXISTS report_families(id TEXT PRIMARY KEY, session_id TEXT UNIQUE NOT NULL, latest TEXT);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, family TEXT NOT NULL, version INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(family,version));
CREATE TABLE IF NOT EXISTS consents(family TEXT, advisor TEXT, PRIMARY KEY(family,advisor));
CREATE TABLE IF NOT EXISTS advisor_notes(family TEXT, advisor TEXT, note TEXT, PRIMARY KEY(family,advisor));
CREATE TABLE IF NOT EXISTS idempotency_records(actor TEXT, endpoint TEXT, key TEXT, payload TEXT, response TEXT, PRIMARY KEY(actor,endpoint,key));
CREATE TABLE IF NOT EXISTS source_snapshots(id TEXT PRIMARY KEY, data TEXT NOT NULL);
PRAGMA user_version=1;
'''

PHASE3_SCHEMA = '''
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS source_manifests(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS normalized_cache(snapshot_id TEXT PRIMARY KEY, query_key TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS cache_query ON normalized_cache(query_key);
CREATE TABLE IF NOT EXISTS agent_runs(
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, endpoint TEXT NOT NULL, request_key TEXT NOT NULL,
 payload TEXT NOT NULL, context TEXT NOT NULL, status TEXT NOT NULL,
 lease_token TEXT NOT NULL, lease_until REAL NOT NULL, response TEXT,
 error_code TEXT, UNIQUE(actor,endpoint,request_key));
CREATE TABLE IF NOT EXISTS agent_traces(run_id TEXT PRIMARY KEY, data TEXT NOT NULL);
PRAGMA user_version=2;
COMMIT;
'''


class Repository:
    def __init__(self, path):
        self.path = str(path)
        db = self.connect()
        try:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version > 2: raise RuntimeError('Database schema is newer than this application')
            if version == 0: db.executescript(SCHEMA)
            if version < 2:
                if version == 1:
                    backup_path = self.path + '-pre-v2.backup'
                    if not Path(backup_path).exists():
                        with closing(sqlite3.connect(backup_path)) as backup:
                            db.backup(backup)
                db.executescript(PHASE3_SCHEMA)
        finally: db.close()

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def backup(self, destination):
        if Path(destination).resolve() == Path(self.path).resolve():
            raise ValueError('Backup must use a different path')
        with closing(self.connect()) as source, closing(sqlite3.connect(str(destination))) as target:
            source.backup(target)

    def save_source(self, envelope, query_key):
        from .grounded.contracts import SourceEnvelope, canonical
        envelope = SourceEnvelope.model_validate(envelope)
        data = canonical(envelope.model_dump(mode='json'))
        with self.transaction() as db:
            db.execute('INSERT OR IGNORE INTO normalized_cache VALUES(?,?,?)',
                       (envelope.snapshotId, query_key, data))

    def read_source(self, snapshot_id):
        from .grounded.contracts import SourceEnvelope
        with closing(self.connect()) as db:
            row = db.execute('SELECT data FROM normalized_cache WHERE snapshot_id=?', (snapshot_id,)).fetchone()
        if row is None: raise KeyError(snapshot_id)
        return SourceEnvelope.model_validate(json.loads(row['data']))

    def save_manifest(self, manifest):
        from .grounded.contracts import canonical, digest
        data = canonical(manifest)
        manifest_id = 'manifest-' + digest(manifest)
        with self.transaction() as db:
            db.execute('INSERT OR IGNORE INTO source_manifests VALUES(?,?)', (manifest_id, data))
        return manifest_id

    def read_manifest(self, manifest_id):
        with closing(self.connect()) as db:
            row = db.execute('SELECT data FROM source_manifests WHERE id=?', (manifest_id,)).fetchone()
        if row is None: raise KeyError(manifest_id)
        return json.loads(row['data'])

    def save_trace(self, run_id, trace):
        from .grounded.trace import RunTrace
        data = RunTrace.model_validate(trace).model_dump_json()
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM agent_runs WHERE id=?', (run_id,)).fetchone():
                raise KeyError(run_id)
            db.execute('INSERT OR REPLACE INTO agent_traces VALUES(?,?)', (run_id, data))

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
