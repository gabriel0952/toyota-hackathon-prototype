from datetime import datetime, timezone, timedelta
import pytest
from decision_api.grounded.contracts import SourceEnvelope
from decision_api.grounded.planning import plan_charging

NOW = datetime(2026, 9, 22, tzinfo=timezone.utc)
AREA = '63000100'


def station(id, standard='CCS1', **kwargs):
    return dict(dict(id=id, name='Synthetic '+id, areaCode=AREA,
                     connectors=[{'id': id+'-1', 'standard': standard}], windows=['day']), **kwargs)


def snapshot(stations, **kwargs):
    return SourceEnvelope.capture(**dict(dict(providerVersion='synthetic-1', sourceKind='demo',
        origin='synthetic:test', retrievedAt=NOW, sourceUpdatedAt=NOW, coverage='complete',
        query={'areaCode': AREA}, payload={'stations': stations}), **kwargs))


def plan(data, **kwargs):
    return plan_charging(**dict(dict(daily=data, area_code=AREA, window='day',
        ac_connector='SAE_J1772', dc_connector='CCS1', now=NOW), **kwargs))


def test_distinct_backup_and_deterministic_order_and_destination_limit():
    a, b = station('a'), station('b', 'SAE_J1772')
    a['connectors'].append({'id': 'a-2', 'standard': 'CCS1'})
    result = plan(snapshot([b, a, a]), destination=snapshot([a]),
                  destination_area=AREA, destination_window='day')
    assert [(p['name'], p['station']['stationId']) for p in result['plans']] == [('A','a'),('B','b'),('C','a')]
    assert result['plans'][2]['purpose'] == 'destination_only'
    assert result['enRouteFeasibility'] == 'not_assessed'
    assert result == plan(snapshot([b, a, a]), destination=snapshot([a]),
                          destination_area=AREA, destination_window='day')
    assert 'independent_backup_station' in plan(snapshot([a, a]))['missingFields']


@pytest.mark.parametrize('changes,reason', [
    ({'connectors': [{'id': 'x', 'standard': None}]}, 'station_connector_unknown'),
    ({'connectors': [{'id': 'x', 'standard': 'CCS2'}]}, 'incompatible_connector'),
    ({'windows': None}, 'opening_window_unknown'),
    ({'windows': []}, 'closed_in_requested_window'),
])
def test_excludes_incompatible_or_unknown_station(changes, reason):
    result = plan(snapshot([station('a', **changes)]))
    assert not result['plans']
    assert result['dailyEvidence']['excluded'][0]['reason'] == reason


def test_empty_coverage_is_distinct_from_unknown_and_stale():
    assert plan(snapshot([]))['dailyEvidence']['status'] == 'known_empty'
    for changes in ({'coverage': 'partial'}, {'coverage': 'none'}, {'sourceUpdatedAt': None},
                    {'sourceUpdatedAt': NOW-timedelta(days=2)}, {'missingFields': ['page']}):
        assert plan(snapshot([], **changes))['dailyEvidence']['status'] == 'needs_confirmation'
    for changes in ({'sourceUpdatedAt': NOW-timedelta(days=2)}, {'coverage': 'none'}):
        assert not plan(snapshot([station('a')], **changes))['plans']


def test_home_arrangement_uses_first_public_station_as_backup_without_inventing_destination():
    result = plan(snapshot([station('a')]), stable_charging='home')
    assert result['plans'][0]['kind'] == 'home'
    assert result['plans'][1]['name'] == 'B'
    assert result['plans'][1]['station']['availability'] == 'unknown'
    assert result['missingFields'] == ['destination_scope']


def test_conflicting_duplicates_and_wrong_scope_cannot_prove_known_empty():
    result = plan(snapshot([station('a'), station('a', windows=[])]))
    assert result['dailyEvidence']['status'] == 'needs_confirmation'
    assert result['dailyEvidence']['excluded'][0]['reason'] == 'conflicting_station_records'
    result = plan(snapshot([station('a', areaCode='63000090')]))
    assert result['dailyEvidence']['status'] == 'needs_confirmation'
    with pytest.raises(ValueError, match='Snapshot query'):
        plan(snapshot([]), area_code='63000090')
    result = plan(snapshot([station('a')]), ac_connector=None, dc_connector=None)
    assert result['dailyEvidence']['status'] == 'needs_confirmation'
