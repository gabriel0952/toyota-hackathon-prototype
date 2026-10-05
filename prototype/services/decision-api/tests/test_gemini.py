import asyncio
import httpx
import pytest
from decision_api.grounded.gemini import GeminiAdapter, ModelFailure


def response(**kwargs):
    return dict(dict(candidates=[{'finishReason':'STOP','content':{'role':'model','parts':[
        {'functionCall': {'name':'finish_report','args':{'actionCodes':[], 'citationIds':[], 'phraseCodes':[]}}}]}}],
        usageMetadata={'promptTokenCount': 100,'candidatesTokenCount': 20}, modelVersion='gemini-2.5-flash'), **kwargs)


def test_real_adapter_protocol_with_fake_http_transport():
    def handle(req):
        import json
        assert req.url.host == 'generativelanguage.googleapis.com'
        assert req.headers['x-goog-api-key'] == 'synthetic-secret'
        assert 'synthetic-secret' not in str(req.url)
        body = json.loads(req.content)
        assert body['generationConfig']['thinkingConfig']['includeThoughts'] is False
        assert body['toolConfig']['functionCallingConfig']['mode'] == 'ANY'
        return httpx.Response(200, json=response())
    adapter = GeminiAdapter('synthetic-secret', transport=httpx.MockTransport(handle))
    turn = asyncio.run(adapter.turn([{'role':'user','parts':[{'text':'test'}]}],
        [{'name':'finish_report','parameters':{'type':'object'}}], max_output_tokens=500))
    assert turn.calls[0]['name'] == 'finish_report'
    assert (turn.input_tokens, turn.output_tokens) == (100,20)


def test_retries_only_once_and_never_exposes_provider_error_body():
    calls=[]
    def handle(req):
        calls.append(req)
        return httpx.Response(429, text='SECRET provider debug')
    adapter = GeminiAdapter('key', transport=httpx.MockTransport(handle))
    with pytest.raises(ModelFailure, match='^model_unavailable$'):
        asyncio.run(adapter.turn([], [], max_output_tokens=100))
    assert len(calls) == 2


def test_thought_text_not_returned_and_invalid_usage_rejected():
    data=response()
    data['candidates'][0]['content']['parts'].insert(0, {'thought': True, 'text':'private reasoning'})
    assert 'private reasoning' not in str(GeminiAdapter.parse(data))
    with pytest.raises(ModelFailure):
        GeminiAdapter.parse(response(candidates=[{'finishReason':'MAX_TOKENS'}]))
    with pytest.raises(ModelFailure):
        GeminiAdapter.parse(response(usageMetadata={'promptTokenCount':-1,'candidatesTokenCount':1}))
