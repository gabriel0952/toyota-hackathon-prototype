import json
from contextlib import closing
from datetime import datetime, timezone
from .contracts import SourceEnvelope, ChargingQuery
from .normalize import AREA


class CachedTdxProvider:
    def __init__(self, repo, clock=lambda:datetime.now(timezone.utc)):
        self.repo,self.clock=repo,clock

    def latest(self, key):
        with closing(self.repo.connect()) as db:
            rows=db.execute('SELECT data FROM normalized_cache WHERE query_key=?',(key,)).fetchall()
        if not rows:raise ConnectionError('required_cache_missing')
        sources=[SourceEnvelope.model_validate(json.loads(r['data'])) for r in rows]
        return max(sources,key=lambda s:(s.retrievedAt,s.snapshotId))

    def query(self, query: ChargingQuery):
        if query.areaCode!=AREA:
            return SourceEnvelope.capture(providerVersion='tdx-cache-1',sourceKind='tdx',origin='tdx:outside-pilot',
                retrievedAt=self.clock(),sourceUpdatedAt=None,coverage='none',query={'areaCode':query.areaCode},
                missingFields=['outside_verified_pilot'],payload={'stations':[]})
        # Preserve the original time/hash. Reading a cache never makes it fresh.
        return self.latest('tdx:normalized:'+AREA)

    def dynamic(self):
        try:return self.latest('tdx:raw:ConnectorLiveStatus')
        except ConnectionError:return None
