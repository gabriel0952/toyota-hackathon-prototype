"""Reproduce persisted decision content with its original input/rule/source snapshots."""
import json
from datetime import datetime
from .engines.v02.engine import evaluate as evaluate_v02
from .engines.v02 import ENGINE_VERSION, COMPOSER_VERSION

# Each stored grounded report is replayed with the frozen engine that produced it.
def _v03():
    from .engines.v03.engine import evaluate_grounded
    return evaluate_grounded
def _v04():
    from .engines.v04.engine import evaluate_grounded
    return evaluate_grounded
GROUNDED = {'grounded-rules-0.3.0': _v03, 'grounded-rules-0.4.0': _v04}


def reproduce(repo, report_id):
    with repo.transaction() as db:
        row = db.execute('SELECT data FROM reports WHERE id=?', (report_id,)).fetchone()
        if row is None: raise KeyError(report_id)
        report = json.loads(row['data'])
        execution = report.get('_execution', {})
        modern=report.get('contractVersion')=='0.3'
        if modern:
            if report.get('engineVersion') not in GROUNDED or report.get('composerVersion')!='grounded-composer-1':
                raise ValueError('Unsupported historical engine or composer version')
        elif (report.get('contractVersion') != '0.2'
                or execution.get('engineVersion', ENGINE_VERSION) != ENGINE_VERSION
                or execution.get('composerVersion', COMPOSER_VERSION) != COMPOSER_VERSION):
            raise ValueError('Unsupported historical engine or composer version')
        rules = json.loads(db.execute('SELECT data FROM source_snapshots WHERE id=?', (report['ruleVersion'],)).fetchone()[0])
        snapshots = [json.loads(db.execute('SELECT data FROM source_snapshots WHERE id=?', (key,)).fetchone()[0]) for key in report['dataSnapshotIds']]
    if modern:
        evaluate_grounded=GROUNDED[report['engineVersion']]()
        evidence={name:next(s for s in snapshots if s['snapshotId']==sid) for name,sid in report['_evidenceKeys'].items()}
        result=evaluate_grounded(report['inputSnapshot'],evidence,
            evaluated_at=datetime.fromisoformat(report['evaluatedAt']),rules=rules)
        for key in ('_sourceSnapshots','_ruleSnapshot','_evidenceKeys'):result.pop(key,None)
        # Composition is immutable stored output, never a new model generation.
        result['composition']=report['composition']
        result['generationMode']=report['generationMode']
        return result
    class Vehicle:
        def get(self): return next(s for s in snapshots if 'range' in s)
    class Charging:
        def query(self, area, connector, window):
            return next(s for s in snapshots if s.get('area') == area and s.get('connector') == connector and s.get('window') == window)
    class Cost:
        def get(self, home): return next(s for s in snapshots if 'prices' in s)
    result = evaluate_v02(report['inputSnapshot'], rules=rules, vehicle=Vehicle(), charging=Charging(), cost=Cost())
    result.pop('_sourceSnapshots')
    return result
