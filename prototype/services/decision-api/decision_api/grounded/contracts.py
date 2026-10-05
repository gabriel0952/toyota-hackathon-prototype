from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any, Dict, List, Literal, Optional, Protocol
from pydantic import Field, AwareDatetime, model_validator
from ..models import StrictModel


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return sha256(canonical(value).encode()).hexdigest()


class SourceDocument(StrictModel):
    schemaVersion: Literal['source-1'] = 'source-1'
    providerVersion: str = Field(min_length=1)
    sourceKind: Literal['official', 'tdx', 'assumption', 'demo']
    origin: str = Field(min_length=1)
    retrievedAt: AwareDatetime
    sourceUpdatedAt: Optional[AwareDatetime] = None
    coverage: Literal['complete', 'partial', 'none']
    query: Dict[str, Any]
    missingFields: List[str] = Field(default_factory=list)
    payload: Dict[str, Any]


class SourceEnvelope(SourceDocument):
    snapshotId: str
    contentHash: str

    @model_validator(mode='after')
    def verify(self):
        body = self.model_dump(mode='json', exclude={'snapshotId', 'contentHash'})
        expected = digest(body)
        if self.contentHash != expected or self.snapshotId != 'source-' + expected:
            raise ValueError('Snapshot content does not match its identity')
        return self

    @classmethod
    def capture(cls, **data):
        # Normalize dates with Pydantic before computing their content identity.
        draft = SourceDocument.model_validate(data)
        body = draft.model_dump(mode='json', exclude={'snapshotId', 'contentHash'})
        hashed = digest(body)
        return cls.model_validate({**body, 'snapshotId': 'source-' + hashed, 'contentHash': hashed})

    def freshness_at(self, now: datetime, ttl_seconds: int):
        if now.tzinfo is None or ttl_seconds <= 0: raise ValueError('Aware clock and positive TTL required')
        if self.sourceUpdatedAt is None: return 'unknown'
        age = (now - self.sourceUpdatedAt).total_seconds()
        if age < 0: return 'unknown'
        return 'fresh' if age <= ttl_seconds else 'stale'


class ProfileQuery(StrictModel):
    profileId: str = Field(min_length=1, max_length=100)


class ChargingQuery(StrictModel):
    areaCode: str = Field(pattern=r'^\d{8}$')
    profileId: str = Field(min_length=1, max_length=100)
    window: Literal['day', 'night']


class KnowledgeQuery(ProfileQuery):
    topic: Literal['bz4x', 'charging', 'warranty']
    query: str = Field(max_length=300)


class CostQuery(ProfileQuery):
    chargingMode: Literal['home', 'work', 'public']


class VehicleKnowledgeProvider(Protocol):
    def get(self, query: ProfileQuery) -> SourceEnvelope: ...


class ChargingProvider(Protocol):
    def query(self, query: ChargingQuery) -> SourceEnvelope: ...


class CostParameterProvider(Protocol):
    def get(self, query: CostQuery) -> SourceEnvelope: ...


class KnowledgeRetriever(Protocol):
    def search(self, query: KnowledgeQuery, role: str, for_model: bool = False) -> SourceEnvelope: ...
