"""A bounded controller over submitted evidence; no conversational interrogation."""
import asyncio
from dataclasses import dataclass
from time import monotonic
from .composition import Composition, compose_verified
from .contracts import canonical, digest
from .gemini import ModelFailure
from .registry import ToolRejected


@dataclass(frozen=True)
class EvidenceRequest:
    key: str
    tool: str
    arguments: dict


class EvidenceFailure(ConnectionError):
    """Critical evidence failed: the API must keep the pending revision unpublished."""


async def run_agent(*, registry, role, requests, evaluate, model=None,
                    export_for_model=None, max_tokens=12000, max_rounds=4,
                    max_calls=8, deadline_seconds=20):
    if not 1 <= max_rounds <= 4 or not 1 <= max_calls <= 8 or not 0 < deadline_seconds <= 20 or max_tokens < 1:
        raise ValueError('Invalid agent limits')
    started = monotonic()
    session = registry.session(role, max_calls=max_calls, deadline_seconds=deadline_seconds)
    evidence = {}
    try:
        # Mandatory evidence is a controller decision. A model cannot skip these calls.
        for req in requests:
            if req.key in evidence: raise ValueError('Duplicate evidence key')
            evidence[req.key] = await session.call(req.tool, req.arguments)
        decision = evaluate(evidence)
    except (ToolRejected, ValueError, ConnectionError) as exc:
        raise EvidenceFailure('required_evidence_failed') from None
    actions = {action['kind']: action for action in decision.get('nextActions', [])}
    citations, public = {}, {}
    tokens, rounds, model_version = 0, 0, None
    candidate, error = None, 'template_configured'
    try:
        if model is not None:
            if export_for_model is None: raise ModelFailure('model_context_not_authorized')
            # This explicit boundary must strip restricted claims and personal fields.
            public = export_for_model(evidence)
            for item in public.values():
                for claim in item.get('claims', []):
                    citations[claim['id']] = claim
            contents = [{'role':'user', 'parts':[{'text':canonical({
                'task':'Select explanation codes for this completed rule evaluation.',
                'actionCodes':list(actions), 'evidence':public})}]}]
            allowed = {digest({'name':r.tool,'args':r.arguments}): r for r in requests}
            names = {r.tool for r in requests}
            schemas = [s for s in registry.schemas(role) if s['name'] in names]
            schemas.append({'name':'finish_report','parameters':Composition.model_json_schema()})
            for _ in range(max_rounds):
                remaining = session.ends-monotonic()
                # Conservative UTF-8 byte reserve plus system/schema framing; no unbounded context.
                reserve = len(canonical({'contents':contents,'schemas':schemas}).encode()) + 1024
                output_limit = min(1024, max_tokens-tokens-reserve)
                if remaining <= 0 or output_limit < 1: raise ModelFailure('agent_budget_exceeded')
                rounds += 1
                turn = await asyncio.wait_for(model.turn(contents, schemas, max_output_tokens=output_limit,
                                                         timeout_seconds=remaining), timeout=remaining)
                tokens += turn.input_tokens + turn.output_tokens
                model_version = turn.model_version
                if tokens > max_tokens: raise ModelFailure('agent_token_budget_exceeded')
                contents.append(turn.content)
                finishing = [c for c in turn.calls if c['name'] == 'finish_report']
                if finishing:
                    if len(turn.calls) != 1: raise ModelFailure('mixed_finish_and_tools')
                    candidate = finishing[0]['args']
                    error = None
                    break
                replies = []
                for call in turn.calls:
                    permitted = allowed.get(digest({'name':call['name'],'args':call['args']}))
                    if permitted is None: raise ModelFailure('tool_outside_submitted_scope')
                    await session.call(call['name'], call['args'])
                    # Reuse the already-authorized export; never send the full internal envelope.
                    replies.append({'functionResponse': {'name':call['name'],
                        'response': {'result':public.get(permitted.key, {})}}})
                contents.append({'role':'user','parts':replies})
            else:
                raise ModelFailure('agent_round_budget_exceeded')
    except (ModelFailure, ToolRejected, asyncio.TimeoutError, ValueError, KeyError, TypeError):
        candidate, error = None, 'generation_failed'
    result = compose_verified(decision, candidate, allowed_actions=actions, allowed_citations=citations)
    result['metadata'] = {'rounds':rounds, 'tokens':tokens, 'modelVersion':model_version,
                          'durationMs':round((monotonic()-started)*1000),
                          'error':error or result['generationError'], 'tools':session.trace}
    return result
