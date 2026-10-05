import asyncio
from dataclasses import dataclass, field
from time import monotonic
from typing import Awaitable, Callable, Dict, Set, Type
from pydantic import BaseModel
from .contracts import SourceEnvelope, digest


class ToolRejected(Exception):
    """Safe error code; do not return arbitrary upstream exception text."""


@dataclass(frozen=True)
class Tool:
    name: str
    version: str
    arguments: Type[BaseModel]
    handler: Callable[[BaseModel], Awaitable[SourceEnvelope]]
    roles: Set[str] = field(default_factory=lambda: {'driver', 'advisor'})
    timeout_seconds: float = 5


class ToolRegistry:
    def __init__(self): self._tools: Dict[str, Tool] = {}

    def register(self, tool: Tool):
        if tool.name in self._tools: raise ValueError('Duplicate tool name')
        if tool.timeout_seconds <= 0: raise ValueError('Positive timeout required')
        self._tools[tool.name] = tool

    def schemas(self, role):
        return [{'name': t.name, 'version': t.version, 'parameters': t.arguments.model_json_schema()} for t in self._tools.values() if role in t.roles]

    def session(self, role, *, max_calls=8, deadline_seconds=20):
        return ToolSession(self, role, max_calls, deadline_seconds)


class ToolSession:
    def __init__(self, registry, role, max_calls, deadline):
        if max_calls <= 0 or deadline <= 0: raise ValueError('Positive execution limits required')
        self.registry, self.role, self.max_calls = registry, role, max_calls
        self.ends = monotonic() + deadline
        self.calls, self.cache, self.trace = 0, {}, []

    async def call(self, name, arguments):
        if self.calls >= self.max_calls or monotonic() >= self.ends: raise ToolRejected('budget_exceeded')
        self.calls += 1
        tool = self.registry._tools.get(name)
        if tool is None or self.role not in tool.roles: raise ToolRejected('tool_not_allowed')
        try: parsed = tool.arguments.model_validate(arguments)
        except ValueError: raise ToolRejected('invalid_arguments') from None
        fingerprint = digest({'name': name, 'version': tool.version, 'arguments': parsed.model_dump(mode='json')})
        if fingerprint in self.cache:
            return SourceEnvelope.model_validate(self.cache[fingerprint])
        started = monotonic()
        event = {'tool': name, 'version': tool.version, 'inputHash': fingerprint}
        try:
            response = await asyncio.wait_for(tool.handler(parsed), timeout=min(tool.timeout_seconds, self.ends-started))
            envelope = SourceEnvelope.model_validate(response)
            self.cache[fingerprint] = envelope.model_dump(mode='json')
            event['snapshotId'] = envelope.snapshotId
            return envelope
        except asyncio.TimeoutError:
            event['error'] = 'tool_timeout'
            raise ToolRejected('tool_timeout') from None
        except ToolRejected:
            # An adapter is an external boundary; never trust even its exception text.
            event['error'] = 'invalid_or_failed_tool'
            raise ToolRejected('invalid_or_failed_tool') from None
        except Exception:
            event['error'] = 'invalid_or_failed_tool'
            raise ToolRejected('invalid_or_failed_tool') from None
        finally:
            event['durationMs'] = round((monotonic()-started)*1000)
            self.trace.append(event)
