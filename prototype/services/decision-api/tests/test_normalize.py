from datetime import datetime, timezone, timedelta
import pytest
from decision_api.grounded.contracts import SourceEnvelope, ChargingQuery
from decision_api.grounded.normalize import normalize_stations, dynamic_availability, windows
from decision_api.grounded.cache import CachedTdxProvider
from decision_api.repository import Repository

NOW=datetime(2026,9,23,tzinfo=timezone.utc)


def raw(dataset, rows, **changes):
    return SourceEnvelope.capture(**dict(dict(providerVersion='synthetic-tdx',sourceKind='demo',origin='synthetic:test',
        retrievedAt=NOW,sourceUpdatedAt=NOW,coverage='complete',query={'dataset':dataset},
        payload={'pages':[{dataset:rows}]}),**changes))


def inputs():
    stations=[{'StationID':'a','StationName':{'Zh_tw':'臺北市內湖區測試站'},'Location':{},'PositionLat':25.08,'PositionLon':121.58},
              {'StationID':'b','StationName':{'Zh_tw':'內湖機廠'},'Location':{'Address':{'Town':'南港區'}}},
              {'StationID':'c','StationName':{'Zh_tw':'未知區域'},'Location':{}}]
    ports=[{'StationID':'a','ConnectorID':'p1','ChargingPointID':'point-1','Type':5,'Power':1,'PowerRating':'7.04kW'},
           {'StationID':'a','ConnectorID':'p2','ChargingPointID':'point-2','Type':1,'Power':1,'PowerRating':'7KW'}]
    hours=[{'StationID':'a','OpeningHours':[{'DayType':1,'StartTime':'00:00','EndTime':'24:00'}]}]
    return raw('Stations',stations),raw('Connectors',ports),raw('ServiceTimes',hours)


def test_normalize_explicit_district_power_conflicts_and_coverage():
    result=normalize_stations(*inputs(),now=NOW)
    assert result.coverage=='partial'
    assert len(result.payload['stations'])==1
    station=result.payload['stations'][0]
    assert station['connectors'][0]['standard']=='SAE_J1772'
    assert station['connectors'][1]['standard'] is None
    assert station['windows']==['day','night']
    assert len(result.payload['rawSnapshotIds'])==3
    assert result.payload['excludedRecords']==[{'stationId':'c','reason':'district_unresolved'}]


def test_partial_unknown_time_and_conflicting_station_stay_unconfirmed():
    s,c,t=inputs()
    changed=raw('Stations',s.payload['pages'][0]['Stations'],coverage='partial',sourceUpdatedAt=None)
    result=normalize_stations(changed,c,t,now=NOW)
    assert result.sourceUpdatedAt is None and result.coverage=='partial'
    duplicate=dict(s.payload['pages'][0]['Stations'][0],PositionLat=24.0)
    changed=raw('Stations',s.payload['pages'][0]['Stations']+[duplicate])
    assert not normalize_stations(changed,c,t,now=NOW).payload['stations']


def test_operating_hours_do_not_assume_weekday_or_ambiguous_24h():
    assert windows([{'DayType':2,'StartTime':'18:00','EndTime':'08:00'}]) is None
    assert windows([{'DayType':1,'StartTime':'00:00','EndTime':'00:00'}]) is None
    assert windows([{'DayType':1,'StartTime':'18:00','EndTime':'08:00'}])==['night']
    assert windows([{'DayType':1,'StartTime':'08:00','EndTime':'18:00'}])==['day']


def test_dynamic_status_needs_fresh_wrapper_and_connector_timestamp():
    row={'StationID':'a','ConnectorID':'p1','ConnectorStatus':1,'LastUpdateTime':NOW.isoformat()}
    s=raw('LiveStatuses',[row])
    assert dynamic_availability(s,'a',['p1'],now=NOW)=='available_at_source_time'
    assert dynamic_availability(s,'a',['p1'],now=NOW+timedelta(minutes=6))=='unknown'
    stale=raw('LiveStatuses',[{**row,'LastUpdateTime':(NOW-timedelta(hours=1)).isoformat()}])
    assert dynamic_availability(stale,'a',['p1'],now=NOW)=='unknown'
    assert dynamic_availability(s,'different-station',['p1'],now=NOW)=='unknown'


def test_cache_pins_identity_and_never_falls_back_to_seed(tmp_path):
    repo=Repository(tmp_path/'cache.db');provider=CachedTdxProvider(repo,clock=lambda:NOW)
    query=ChargingQuery(areaCode='63000100',profileId='tw-test',window='day')
    with pytest.raises(ConnectionError):provider.query(query)
    s=normalize_stations(*inputs(),now=NOW)
    repo.save_source(s,'tdx:normalized:63000100')
    assert provider.query(query).snapshotId==s.snapshotId
    provider.clock=lambda:NOW+timedelta(days=2)
    assert provider.query(query).freshness_at(provider.clock(),86400)=='stale'
    outside=provider.query(ChargingQuery(areaCode='66000060',profileId='tw-test',window='day'))
    assert outside.coverage=='none' and outside.payload['stations']==[]
    assert provider.dynamic() is None
