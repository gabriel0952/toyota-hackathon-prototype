"""Runtime validation for public v0.3 projections; trace fields are forbidden."""
from typing import List, Dict, Literal, Optional
from pydantic import AwareDatetime, Field, model_validator
from ..models import StrictModel


class Citation(StrictModel):
    id: str
    text: str
    origin: str
    locator: str
    contentHash: str = Field(pattern=r'^[a-f0-9]{64}$')


class PublicSource(StrictModel):
    label: str
    status: Literal['fixture','assumption','verified']
    updatedAt: str
    snapshotId: str
    sourceKind: Literal['official','tdx','assumption','demo']
    origin: str
    retrievedAt: AwareDatetime
    sourceUpdatedAt: Optional[AwareDatetime]
    freshness: Literal['fresh','stale','unknown']
    coverage: Literal['complete','partial','none']
    missingFields: List[str]


class Action(StrictModel):
    label: str
    kind: Literal['consult','test-drive','reevaluate']


class Composition(StrictModel):
    actions: List[Action]
    citations: List[Citation]
    explanation: List[str]


class Plan(StrictModel):
    name: str
    title: str
    description: str
    timing: str
    purpose: Literal['daily','backup','destination_only']
    stationIds: List[str]
    snapshotIds: List[str]
    limitations: List[str]


class Cost(StrictModel):
    status: Literal['estimated','unavailable']
    min: Optional[float]
    max: Optional[float]
    note: str
    unit: Literal['TWD/month']
    inputs: Dict[str,float]
    formula: str


class TcoCurves(StrictModel):
    years: List[float]
    current: List[float]
    newIce: List[float]
    bz4x: List[float]


class TcoBreakdown(StrictModel):
    purchase: float
    energy: float
    maintenance: float
    tax: float


class TcoAnalysis(StrictModel):
    status: Literal['estimated','unavailable']
    note: str
    version: Optional[str] = None
    comparisonVehicle: Optional[str] = None
    plannedOwnershipYears: Optional[int] = None
    breakEvenVsNewIceYears: Optional[float] = None
    breakEvenVsKeepYears: Optional[float] = None
    fiveYearSavingsVsNewIce: Optional[float] = None
    fiveYearSavingsVsKeep: Optional[float] = None
    annualEnergySavingsRate: Optional[float] = None
    annualEnergyCost: Optional[Dict[str,float]] = None
    curves: Optional[TcoCurves] = None
    fiveYearBreakdown: Optional[Dict[str,TcoBreakdown]] = None
    inputs: Optional[Dict[str,float]] = None
    inputSources: Optional[Dict[str,str]] = None


class Resistance(StrictModel):
    id: str
    title: str
    score: float
    status: Literal['resolved','manageable','pending','high']
    description: str
    evidence: List[str]
    improvement: str


class Journey(StrictModel):
    label: str
    title: str
    detail: str


class DriverReport(StrictModel):
    contractVersion: Literal['0.3']
    id: str
    sessionId: str
    reportFamilyId: str
    version: int = Field(ge=1)
    createdAt: AwareDatetime
    inputRevision: int = Field(ge=0)
    ruleVersion: str
    dataSnapshotIds: List[str]
    kind: Literal['actual','simulation']
    basedOnReportId: Optional[str]
    changeSummary: List[str]
    evaluationStatus: Literal['assessed','needs_confirmation']
    route: Optional[Literal['ready','home_install_required','public_charging_ready','not_ready']]
    path: Optional[Literal['green','yellow','gray']]
    chargingDataStatus: Literal['available','no_data','no_nearby_station','provider_error']
    pathLabel: str
    headline: str
    summary: str
    completeness: float = Field(ge=0,le=100)
    vehicle: str
    ownershipYears: float
    resistances: List[Resistance]
    monthlyCost: Cost
    tcoAnalysis: Optional[TcoAnalysis] = None
    plans: List[Plan]
    journeys: List[Journey]
    assumptions: List[str]
    sources: List[PublicSource]
    recommendations: List[str]
    successCases: List[str]
    nextActions: List[Action]
    blurredLocations: List[str]
    pendingConfirmations: List[str]
    targetVehicleProfileId: str
    engineVersion: Literal['grounded-rules-0.3.0','grounded-rules-0.4.0']
    composerVersion: Literal['grounded-composer-1']
    generationMode: Literal['template','llm']
    evaluatedAt: AwareDatetime
    citations: List[Citation]
    composition: Composition

    @model_validator(mode='after')
    def decision_consistent(self):
        lamps={'ready':'green','home_install_required':'yellow','public_charging_ready':'yellow','not_ready':'gray'}
        if self.evaluationStatus=='needs_confirmation':
            if self.route is not None or self.path is not None:raise ValueError('Unknown decision has a lamp')
        elif self.route is None or lamps[self.route]!=self.path:raise ValueError('Inconsistent route/lamp')
        if self.route in (None,'not_ready') and (self.recommendations or self.successCases or any(a.kind!='reevaluate' for a in self.nextActions)):
            raise ValueError('Unsupported sales advice')
        if self.monthlyCost.status=='unavailable':
            if self.monthlyCost.min is not None or self.monthlyCost.max is not None:raise ValueError('Unknown cost')
        elif self.monthlyCost.min is None or self.monthlyCost.max is None or not 0<=self.monthlyCost.min<=self.monthlyCost.max:
            raise ValueError('Invalid cost bounds')
        snapshots=set(self.dataSnapshotIds)
        if any(s.snapshotId not in snapshots for s in self.sources):raise ValueError('Unpinned source')
        if any(not set(p.snapshotIds).issubset(snapshots) for p in self.plans):raise ValueError('Unpinned plan')
        if not {c.id for c in self.composition.citations}.issubset({c.id for c in self.citations}):raise ValueError('Unseen citation')
        return self


class AdvisorReport(DriverReport):
    advisorNotes: List[str]
    suggestedQuestions: List[str]
