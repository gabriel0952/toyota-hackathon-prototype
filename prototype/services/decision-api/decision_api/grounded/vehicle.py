"""Reviewed, version-specific target EV profiles; never infer from the owner's car."""
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import List, Literal, Optional
from pydantic import Field, model_validator
from ..models import StrictModel
from .contracts import SourceEnvelope, ProfileQuery, KnowledgeQuery, digest


class TargetProfile(StrictModel):
    id: str = Field(min_length=1)
    market: Literal['TW']
    model: str = Field(min_length=1)
    specificationCode: str = Field(min_length=1)
    applicableProductionFrom: str
    reviewStatus: Literal['pending', 'reviewed', 'conflict']
    reviewedBy: Optional[str] = None
    acConnector: Optional[Literal['SAE_J1772', 'TYPE_2']] = None
    dcConnector: Optional[Literal['CCS1', 'CCS2', 'CHADEMO']] = None
    claimIds: List[str] = Field(min_length=1)
    contentHash: str

    @model_validator(mode='after')
    def verify(self):
        if digest(self.model_dump(mode='json', exclude={'contentHash'})) != self.contentHash:
            raise ValueError('Profile content hash mismatch')
        if self.reviewStatus == 'reviewed' and not self.reviewedBy:
            raise ValueError('Profile reviewer required')
        # Applicability is a production date, not an inferred model year.
        datetime.strptime(self.applicableProductionFrom, '%Y-%m-%d')
        return self


class OfficialVehicleKnowledge:
    def __init__(self, profiles, knowledge, clock=lambda: datetime.now(timezone.utc)):
        parsed = [TargetProfile.model_validate(p) for p in profiles]
        self.profiles = {p.id: p for p in parsed}
        if len(self.profiles) != len(parsed):
            raise ValueError('Duplicate profile ID')
        self.knowledge, self.clock = knowledge, clock

    @classmethod
    def from_file(cls, path, knowledge):
        return cls(json.loads(Path(path).read_text())['profiles'], knowledge)

    def get(self, query: ProfileQuery, *, for_model=False) -> SourceEnvelope:
        profile = self.profiles.get(query.profileId)
        if profile is None or profile.reviewStatus != 'reviewed':
            raise ValueError('Target vehicle profile not reviewed')
        # Claims must remain public and applicable at read time, not just import time.
        q = KnowledgeQuery(profileId=profile.id, topic='bz4x', query='')
        citations = [self.knowledge.resolve(cid, q, 'driver', for_model=for_model) for cid in profile.claimIds]
        missing = [name for name in ('acConnector', 'dcConnector') if getattr(profile, name) is None]
        return SourceEnvelope.capture(
            providerVersion='official-vehicle-1', sourceKind='official',
            origin='official-profile-manifest', retrievedAt=self.clock(), sourceUpdatedAt=None,
            coverage='partial' if missing else 'complete', query=query.model_dump(), missingFields=missing,
            payload={'profile': profile.model_dump(mode='json', exclude={'reviewedBy'}), 'citations': citations})
