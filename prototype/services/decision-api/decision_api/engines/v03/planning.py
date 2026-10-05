"""Deterministic candidates from a vendor-neutral snapshot, never navigation.

This contract is not a claimed mapping of TDX fields. A validated ingestion
adapter must supply these fields and preserve unknowns before real use.
"""
from datetime import datetime
from typing import List, Literal, Optional
from pydantic import Field
from ...models import StrictModel
from ...grounded.contracts import SourceEnvelope


class Connector(StrictModel):
    id: str = Field(min_length=1)
    standard: Optional[Literal['SAE_J1772', 'TYPE_2', 'CCS1', 'CCS2', 'CHADEMO']]
    powerKw: Optional[float] = Field(default=None, ge=0)
    chargingPointId: Optional[str] = None


class CandidateStation(StrictModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    areaCode: str = Field(pattern=r'^\d{8}$')
    connectors: List[Connector]
    # None is unknown, [] means known closed during both supported windows.
    windows: Optional[List[Literal['day', 'night']]]
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    areaBasis: Optional[str] = None
    missingFields: List[str] = Field(default_factory=list)
    rateDescription: Optional[str] = None


class StationPayload(StrictModel):
    stations: List[CandidateStation]
    rawSnapshotIds: List[str] = Field(default_factory=list)
    excludedRecords: List[dict] = Field(default_factory=list)


def candidates(snapshot: SourceEnvelope, *, area_code, window, connectors, now, ttl_seconds):
    if window not in (None, 'day', 'night'):
        raise ValueError('Unknown charging window')
    if snapshot.query.get('areaCode') != area_code:
        raise ValueError('Snapshot query does not match requested area')
    data = StationPayload.model_validate(snapshot.payload)
    freshness = snapshot.freshness_at(now, ttl_seconds)
    approved, excluded = {}, []
    grouped = {}
    for station in data.stations:
        grouped.setdefault(station.id, []).append(station)
    for station_id in sorted(grouped):
        copies = grouped[station_id]
        station = copies[0]
        reason = None
        if snapshot.coverage == 'none':
            reason = 'source_without_coverage'
        elif any(s != station for s in copies[1:]):
            reason = 'conflicting_station_records'
        elif station.areaCode != area_code:
            reason = 'outside_query_area'
        elif freshness != 'fresh':
            reason = 'static_source_' + freshness
        elif not connectors:
            reason = 'target_connector_unknown'
        elif not station.connectors or any(c.standard is None for c in station.connectors):
            # Known compatible ports can be used even if other ports are unknown.
            if not any(c.standard in connectors for c in station.connectors):
                reason = 'station_connector_unknown'
        if reason is None and not any(c.standard in connectors for c in station.connectors):
            reason = 'incompatible_connector'
        if reason is None and (window is None or station.windows is None):
            reason = 'opening_window_unknown'
        if reason is None and window not in station.windows:
            reason = 'closed_in_requested_window'
        if reason:
            excluded.append({'stationId': station_id, 'reason': reason})
        else:
            approved[station_id] = {
                'stationId': station_id, 'name': station.name,
                'connectorIds': sorted({c.id for c in station.connectors if c.standard in connectors}),
                'snapshotId': snapshot.snapshotId, 'availability': 'unknown',
                'limitations': ['候選站點；尚未驗證即時空槍、費率與停車限制'],
            }
    uncertain_reasons = {'station_connector_unknown', 'target_connector_unknown',
                         'opening_window_unknown', 'conflicting_station_records', 'outside_query_area'}
    complete = (snapshot.coverage == 'complete' and not snapshot.missingFields
                and freshness == 'fresh' and connectors and window
                and not any(e['reason'] in uncertain_reasons for e in excluded))
    status = 'candidates' if approved else 'known_empty' if complete else 'needs_confirmation'
    return {'status': status, 'coverage': snapshot.coverage, 'freshness': freshness,
            'candidates': list(approved.values()), 'excluded': excluded}


def plan_charging(*, daily, area_code, window, ac_connector, dc_connector,
                  now: datetime, stable_charging=None, destination=None,
                  destination_area=None, destination_window=None, ttl_seconds=86400):
    """Plan A daily, B an independent station, C destination only.

    stable_charging is an explicitly supplied home/work arrangement, not a
    construction permit or an inference from parking ownership.
    """
    if stable_charging not in (None, 'home', 'work'):
        raise ValueError('Unknown stable charging arrangement')
    compatible = {c for c in (ac_connector, dc_connector) if c is not None}
    options = candidates(daily, area_code=area_code, window=window, connectors=compatible,
                         now=now, ttl_seconds=ttl_seconds)
    stations = options['candidates']
    plans = []
    offset = 0
    if stable_charging:
        plans.append({'name': 'A', 'purpose': 'daily', 'kind': stable_charging,
                      'basis': 'submitted_condition', 'station': None})
    elif stations:
        plans.append({'name': 'A', 'purpose': 'daily', 'kind': 'public', 'station': stations[0]})
        offset = 1
    if len(stations) > offset:
        plans.append({'name': 'B', 'purpose': 'backup', 'kind': 'public', 'station': stations[offset]})
    missing = []
    if not any(p['name'] == 'A' for p in plans): missing.append('daily_charging_candidate')
    if not any(p['name'] == 'B' for p in plans): missing.append('independent_backup_station')
    destination_result = None
    if destination is not None and destination_area:
        destination_result = candidates(destination, area_code=destination_area, window=destination_window,
                                        connectors=compatible, now=now, ttl_seconds=ttl_seconds)
        if destination_result['candidates']:
            plans.append({'name': 'C', 'purpose': 'destination_only', 'kind': 'public',
                          'station': destination_result['candidates'][0]})
        else:
            missing.append('destination_charging_candidate')
    else:
        missing.append('destination_scope')
    return {'plans': plans, 'dailyEvidence': options, 'destinationEvidence': destination_result,
            'missingFields': missing, 'enRouteFeasibility': 'not_assessed',
            'limitations': ['未接入導航路線資料；目的地候選不代表沿途或整段長途可行']}
