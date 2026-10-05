from typing import Literal, Union, Optional
from pydantic import BaseModel, ConfigDict, model_validator, Field
from datetime import datetime


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Evidence(StrictModel):
    value: Union[str, float, bool, None]
    status: Literal['provided', 'unknown', 'not_applicable']
    source: Literal['user', 'advisor', 'fixture']
    updatedAt: datetime

    @model_validator(mode='after')
    def valid_value(self):
        if (self.status == 'provided') == (self.value is None):
            raise ValueError('provided requires value; absent fields require null')
        return self


FIELD_TYPES = {
    'vehicle': str, 'vehicleType': str, 'ownershipYears': float,
    'home': str, 'work': str, 'leisure': str, 'parking': str,
    'chargingMethod': str, 'distance': float, 'tripFrequency': str,
    'longDistance': float, 'chargingStop': float, 'monthlyCost': float,
    'monthlyMileage': float, 'homeCharging': str, 'workCharging': str,
    'installAssessment': str, 'chargingWindow': str, 'vehicleAge': float,
    'fuelEfficiencyKmPerL': float, 'homeChargingPercent': float,
    'estimatedTradeInValue': float, 'plannedOwnershipYears': float,
    'homeChargerCost': float, 'replacementVehicle': str,
}
ENUMS = {'parking': ['fixed', 'street'], 'homeCharging': ['available', 'unavailable'],
         'workCharging': ['available', 'unavailable'], 'installAssessment': ['passed', 'failed'],
         'chargingWindow': ['day', 'night'], 'tripFrequency': ['幾乎沒有', '偶爾', '每月 1–2 次', '每週']}
LIMITS = {'ownershipYears': 50, 'distance': 150, 'longDistance': 2000,
          'chargingStop': 600, 'monthlyCost': 30000, 'monthlyMileage': 10000,
          'vehicleAge': 50, 'fuelEfficiencyKmPerL': 50, 'homeChargingPercent': 100,
          'estimatedTradeInValue': 5000000, 'plannedOwnershipYears': 10,
          'homeChargerCost': 1000000}


class Answers(StrictModel):
    contractVersion: Literal['0.2'] = '0.2'
    expectedRevision: int = Field(ge=0)
    fields: dict[str, Evidence]
    questionId: Optional[Literal['vehicle', 'locations', 'distance', 'charging']] = None

    @model_validator(mode='after')
    def known_fields(self):
        for key, field in self.fields.items():
            if key not in FIELD_TYPES:
                raise ValueError(f'Unknown field {key}')
            if field.status != 'provided':
                continue
            v = field.value
            if FIELD_TYPES[key] is str:
                if not isinstance(v, str) or not v.strip() or len(v) > 200:
                    raise ValueError(f'Invalid text: {key}')
                if key in ENUMS and v not in ENUMS[key]:
                    raise ValueError(f'Invalid option: {key}')
            elif isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= LIMITS[key]:
                raise ValueError(f'Invalid number: {key}')
        return self


class Evaluation(StrictModel):
    contractVersion: Literal['0.2','0.3'] = '0.2'
    sessionId: str
    expectedRevision: int = Field(ge=0)
    targetVehicleProfileId: Optional[Literal['toyota-tw-bz4x-202510-a']] = Field(default=None, exclude_if=lambda value:value is None)

    @model_validator(mode='after')
    def target_required(self):
        if self.contractVersion=='0.3' and self.targetVehicleProfileId is None:
            raise ValueError('v0.3 requires an explicit target vehicle profile')
        return self


class Simulation(StrictModel):
    type: Literal['home-charger-approved']
    value: bool


class Note(StrictModel):
    note: str = Field(max_length=2000)


class Share(StrictModel):
    advisorId: Literal['demo-advisor'] = 'demo-advisor'


class Start(StrictModel):
    scenario: Optional[str] = None
