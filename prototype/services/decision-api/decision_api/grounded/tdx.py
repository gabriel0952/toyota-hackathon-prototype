"""TDX city EV raw-data spike, based on the published EV OpenAPI.

The live response shape and field applicability still require G0 verification.
No normalizer or seed fallback is implied by a successful raw fetch.
"""
import asyncio
from datetime import datetime, timezone
import httpx
from .contracts import SourceEnvelope

TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
BASE_URL = 'https://tdx.transportdata.tw/api/basic/v1/EV'
DATASETS = {'Station':'Stations', 'Connector':'Connectors', 'ServiceTime':'ServiceTimes',
            'ConnectorLiveStatus':'LiveStatuses'}


class TdxFailure(ConnectionError):
    pass


class TdxClient:
    def __init__(self, client_id, client_secret, *, transport=None):
        if not client_id or not client_secret: raise ValueError('TDX credentials required')
        self._id, self._secret, self._transport = client_id, client_secret, transport

    async def fetch(self, dataset, *, page_size=1000, max_pages=50, timeout_seconds=20):
        if dataset not in DATASETS or not 1 <= page_size <= 1000 or not 1 <= max_pages <= 100:
            raise ValueError('Invalid TDX query scope')
        async def execute():
            async with httpx.AsyncClient(transport=self._transport, timeout=5, follow_redirects=False, trust_env=False) as client:
                auth = await client.post(TOKEN_URL, data={'grant_type':'client_credentials',
                                        'client_id':self._id, 'client_secret':self._secret})
                if auth.status_code != 200: raise TdxFailure('tdx_authentication_failed')
                token = auth.json().get('access_token')
                if not isinstance(token,str) or not token: raise TdxFailure('tdx_authentication_failed')
                pages, source_times, complete, error = [], [], False, None
                for index in range(max_pages):
                    url = f'{BASE_URL}/{dataset}/City/Taipei'
                    params = {'$format':'JSON', '$top':page_size, '$skip':index*page_size}
                    try:
                        for attempt in range(2):
                            response = await client.get(url, params=params, headers={'Authorization':'Bearer '+token})
                            if response.status_code != 429 and response.status_code < 500: break
                            if attempt == 0: await asyncio.sleep(0.1)
                        if response.status_code != 200: raise TdxFailure('tdx_http_' + str(response.status_code))
                        body = response.json()
                        # Do not silently guess a different wrapper or flatten an unknown shape.
                        if not isinstance(body,dict) or not isinstance(body.get(DATASETS[dataset]),list):
                            raise TdxFailure('tdx_response_shape_unverified')
                        pages.append(body)
                        source_times.append(body.get('SrcUpdateTime'))
                        if len(body[DATASETS[dataset]]) < page_size:
                            complete = True
                            break
                    except (TdxFailure, ValueError, httpx.HTTPError) as exc:
                        code = str(exc) if isinstance(exc,TdxFailure) else 'tdx_fetch_failed'
                        if not pages: raise TdxFailure(code) from None
                        error = 'incomplete_pages:' + code
                        break
                dates = []
                for value in source_times:
                    try:
                        date = datetime.fromisoformat(value.replace('Z','+00:00'))
                        if date.tzinfo is None: raise ValueError()
                        dates.append(date)
                    except (ValueError, TypeError, AttributeError): dates.append(None)
                timestamp = min(dates) if dates and all(d is not None for d in dates) else None
                return SourceEnvelope.capture(providerVersion='tdx-raw-spike-1',sourceKind='tdx',origin=url,
                    retrievedAt=datetime.now(timezone.utc),sourceUpdatedAt=timestamp,
                    coverage='complete' if complete else 'partial',
                    query={'city':'Taipei','dataset':dataset,'pageSize':page_size},
                    missingFields=[] if complete else [error or 'page_limit'], payload={'pages':pages})
        try:
            return await asyncio.wait_for(execute(), timeout=timeout_seconds)
        except TdxFailure: raise
        except (asyncio.TimeoutError, httpx.HTTPError): raise TdxFailure('tdx_unavailable') from None
        except Exception: raise TdxFailure('tdx_invalid_response') from None
