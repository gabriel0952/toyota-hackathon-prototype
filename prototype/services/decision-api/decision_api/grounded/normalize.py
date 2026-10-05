"""TDX mapping checked against the authorized Taipei response on 2026-09-23."""
import re
from datetime import datetime, timezone
from .contracts import SourceEnvelope
from .planning import CandidateStation

CONNECTORS = {1: ('CCS1',2), 2: ('CCS2',2), 3: ('CHADEMO',2),
              5: ('SAE_J1772',1), 6: ('TYPE_2',1)}
AREA = '63000100'


def unique_rows(snapshot, key, identity):
    records, conflicts = {}, set()
    for page in snapshot.payload['pages']:
        for row in page[key]:
            rid = row.get(identity)
            if not isinstance(rid,str) or not rid:
                conflicts.add(None)
                continue
            if rid in records and records[rid] != row: conflicts.add(rid)
            records[rid] = row
    return records, conflicts


def windows(hours):
    # Broad day/night answers require the entire window, every day. Specific
    # weekday/holiday availability remains unknown until the user gives a day.
    intervals=[]
    for h in hours:
        if h.get('DayType') != 1 or h.get('LastEntranceTime'): continue
        try:
            def minute(value):
                if not re.fullmatch(r'(?:[01]\d|2[0-4]):[0-5]\d', value): raise ValueError()
                hh,mm=map(int,value.split(':'))
                if hh==24 and mm: raise ValueError()
                return hh*60+mm
            start,end=minute(h['StartTime']),minute(h['EndTime'])
            if start==end: continue  # 00:00–00:00 is ambiguous, not inferred as 24h.
            intervals.extend([(start,end)] if end>start else [(start,1440),(0,end)])
        except (ValueError,TypeError,KeyError): continue
    if not intervals: return None
    def covers(lo,hi):
        cursor=lo
        for start,end in sorted(intervals):
            if start>cursor: break
            if end>cursor: cursor=end
        return cursor>=hi
    return [name for name,okay in [('day',covers(480,1080)),
        ('night',covers(1080,1440) and covers(0,480))] if okay]


def normalize_stations(stations, connectors, service_times, *, now=None):
    sources=[SourceEnvelope.model_validate(s) for s in (stations,connectors,service_times)]
    rows, station_conflicts=unique_rows(stations,'Stations','StationID')
    ports, port_conflicts=unique_rows(connectors,'Connectors','ConnectorID')
    times, time_conflicts=unique_rows(service_times,'ServiceTimes','StationID')
    missing=[]
    if any(None in values for values in (station_conflicts,port_conflicts,time_conflicts)):
        missing.append('missing_record_identity')
    if any(s.coverage!='complete' for s in sources):missing.append('incomplete_source_pages')
    candidates, excluded=[],[]
    for sid,row in sorted(rows.items()):
        if sid in station_conflicts:
            excluded.append({'stationId':sid,'reason':'conflicting_station'});continue
        name=row.get('StationName',{}).get('Zh_tw','')
        address=row.get('Location',{}).get('Address',{})
        town=address.get('Town')
        basis=None
        if town:
            if town!='內湖區':continue
            basis='TDX Location.Address.Town'
        elif name.startswith(('臺北市內湖區','台北市內湖區')):
            basis='TDX 站名明示完整縣市行政區'
        else:
            excluded.append({'stationId':sid,'reason':'district_unresolved'})
            continue
        station_missing=[]; normalized_ports=[]
        for cid,port in sorted(ports.items()):
            if port.get('StationID')!=sid:continue
            spec=CONNECTORS.get(port.get('Type'))
            standard=spec[0] if spec and port.get('Power')==spec[1] and cid not in port_conflicts else None
            if standard is None:station_missing.append('connector_unknown_or_conflicting')
            power=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*[kK][wW]\s*',str(port.get('PowerRating','')))
            normalized_ports.append({'id':cid,'standard':standard,'chargingPointId':port.get('ChargingPointID'),
                                     'powerKw':float(power[1]) if power else None})
        if not normalized_ports:station_missing.append('connector_records_missing')
        hours=None if sid in time_conflicts else windows(times.get(sid,{}).get('OpeningHours',[]))
        if hours is None:station_missing.append('opening_hours_unknown')
        try:
            candidate=CandidateStation(id=sid,name=name,areaCode=AREA,connectors=normalized_ports,windows=hours,
                latitude=row.get('PositionLat'),longitude=row.get('PositionLon'),areaBasis=basis,
                rateDescription=row.get('ChargingRate'),missingFields=station_missing)
            candidates.append(candidate.model_dump(mode='json'))
        except ValueError:excluded.append({'stationId':sid,'reason':'invalid_station_fields'})
    if excluded:missing.append('district_or_station_records_unresolved')
    dates=[s.sourceUpdatedAt for s in sources]
    return SourceEnvelope.capture(providerVersion='tdx-normalize-1',sourceKind='tdx',
        origin='https://tdx.transportdata.tw/api/basic/v1/EV/Station/City/Taipei',
        retrievedAt=now or datetime.now(timezone.utc),sourceUpdatedAt=min(dates) if all(dates) else None,
        coverage='partial' if missing else 'complete',query={'areaCode':AREA},missingFields=missing,
        payload={'stations':candidates,'rawSnapshotIds':[s.snapshotId for s in sources], 'excludedRecords':excluded})


def dynamic_availability(snapshot, station_id, connector_ids, *, now, ttl_seconds=300):
    """Only fresh per-connector timestamps may describe availability at retrieval."""
    rows, conflicts=unique_rows(snapshot,'LiveStatuses','ConnectorID')
    if snapshot.coverage!='complete' or snapshot.freshness_at(now,ttl_seconds)!='fresh':return 'unknown'
    states=[]
    for cid in connector_ids:
        row=rows.get(cid)
        if not row or cid in conflicts or row.get('StationID')!=station_id:return 'unknown'
        try:
            updated=datetime.fromisoformat(row['LastUpdateTime'].replace('Z','+00:00'))
            age=(now-updated).total_seconds()
            if not 0<=age<=ttl_seconds:return 'unknown'
        except (KeyError,TypeError,ValueError):return 'unknown'
        states.append(row.get('ConnectorStatus'))
    if 1 in states:return 'available_at_source_time'
    return 'unavailable_at_source_time' if states and all(s in (2,3) for s in states) else 'unknown'
