import asyncio
import httpx
import pytest
from decision_api.grounded.tdx import TdxClient, TdxFailure
from decision_api.tdx_probe import load_environment


def test_documented_wrapper_pagination_and_no_secret_in_snapshot():
    seen=[]
    def handle(req):
        seen.append(req)
        if req.method=='POST':return httpx.Response(200,json={'access_token':'SECRET'})
        assert req.headers['authorization']=='Bearer SECRET'
        assert req.url.path.endswith('/Station/City/Taipei')
        rows=[{'synthetic': True}] if req.url.params['$skip']=='0' else []
        return httpx.Response(200,json={'Stations':rows,'SrcUpdateTime':'2026-09-22T00:00:00+08:00'})
    client=TdxClient('id','secret',transport=httpx.MockTransport(handle))
    result=asyncio.run(client.fetch('Station',page_size=1))
    assert result.coverage=='complete' and len(result.payload['pages'])==2
    assert 'SECRET' not in result.model_dump_json()


def test_partial_pages_and_unknown_source_time_are_not_known_empty():
    def handle(req):
        if req.method=='POST':return httpx.Response(200,json={'access_token':'token'})
        if req.url.params['$skip']=='0':return httpx.Response(200,json={'Stations':[{}]})
        return httpx.Response(503,text='secret debug')
    result=asyncio.run(TdxClient('id','secret',transport=httpx.MockTransport(handle)).fetch('Station',page_size=1))
    assert result.coverage=='partial' and result.sourceUpdatedAt is None
    assert result.missingFields==['incomplete_pages:tdx_http_503']
    assert 'secret debug' not in result.model_dump_json()


def test_provider_failure_never_uses_seed_and_unknown_shapes_are_rejected():
    for content in ([{'StationID':'unverified shape'}], {'wrongField': []}):
        def handle(req):
            return httpx.Response(200,json={'access_token':'token'} if req.method=='POST' else content)
        with pytest.raises(TdxFailure):
            asyncio.run(TdxClient('id','secret',transport=httpx.MockTransport(handle)).fetch('Station'))
    with pytest.raises(ValueError):TdxClient('', '')


def test_environment_file_is_data_not_shell_code(tmp_path):
    path=tmp_path/'config'
    path.write_text('TDX_CLIENT_ID="$(do-not-execute)"\nGEMINI_API_KEY=local-only\nHOME=ignored\n')
    data=load_environment(path)
    assert data['TDX_CLIENT_ID']=='$(do-not-execute)'
    assert 'HOME' not in data
