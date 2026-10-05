from datetime import datetime, timezone
import json
from pathlib import Path
from typing import List, Literal, Optional
from pydantic import AwareDatetime, Field, model_validator
from ..models import StrictModel
from .contracts import SourceEnvelope, KnowledgeQuery, digest


class Claim(StrictModel):
    id: str
    topic: Literal['bz4x', 'charging', 'warranty']
    profileIds: List[str]
    market: Literal['TW']
    text: str
    keywords: List[str]
    origin: str
    locator: str
    retrievedAt: AwareDatetime
    sourceUpdatedAt: Optional[AwareDatetime] = None
    validUntil: AwareDatetime
    reviewStatus: Literal['pending', 'reviewed', 'conflict']
    reviewedBy: Optional[str] = None
    allowedRoles: List[Literal['driver', 'advisor']] = Field(default_factory=lambda: ['driver','advisor'])
    externalModelAllowed: bool = False
    contentHash: str

    @model_validator(mode='after')
    def verify(self):
        body = self.model_dump(mode='json', exclude={'contentHash'})
        if digest(body) != self.contentHash: raise ValueError('Claim content hash mismatch')
        if self.reviewStatus == 'reviewed' and not self.reviewedBy: raise ValueError('Reviewer required')
        if self.validUntil < self.retrievedAt: raise ValueError('Invalid review validity')
        return self

    def accessible(self, query, role, for_model, now):
        return (role in self.allowedRoles and (not for_model or self.externalModelAllowed)
                and query.profileId in self.profileIds and self.topic == query.topic
                and self.reviewStatus == 'reviewed' and self.retrievedAt <= now <= self.validUntil)


class KeywordKnowledge:
    def __init__(self, claims, clock=lambda: datetime.now(timezone.utc)):
        self.claims = [Claim.model_validate(c) for c in claims]
        if len({c.id for c in self.claims}) != len(self.claims): raise ValueError('Duplicate claim ID')
        self.clock = clock

    @classmethod
    def from_file(cls, path): return cls(json.loads(Path(path).read_text())['claims'])

    def search(self, query: KnowledgeQuery, role, for_model=False):
        now = self.clock()
        visible = [c for c in self.claims if c.accessible(query, role, for_model, now)]
        terms = query.query.casefold().strip()
        matched = [c for c in visible if not terms or any(k.casefold() in terms or terms in k.casefold() for k in c.keywords)]
        # Only whitelisted citation content leaves this tool. Policy/internal metadata stays local.
        result = [{'id': c.id, 'text': c.text, 'origin': c.origin, 'locator': c.locator, 'contentHash': c.contentHash} for c in sorted(matched,key=lambda c:c.id)]
        return SourceEnvelope.capture(providerVersion='keyword-1', sourceKind='official', origin='knowledge-manifest', retrievedAt=now, sourceUpdatedAt=None, coverage='complete', query=query.model_dump(), missingFields=[] if result else ['reviewed_applicable_claim'], payload={'claims':result})

    def resolve(self, claim_id, query, role, for_model=False):
        for c in self.search(query, role, for_model).payload['claims']:
            if c['id'] == claim_id: return c
        raise KeyError('Claim not found or not authorized')
