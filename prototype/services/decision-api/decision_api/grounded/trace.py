from typing import List, Literal, Optional
from pydantic import Field
from ..models import StrictModel


class ToolTrace(StrictModel):
    tool: str = Field(pattern=r'^[a-z_]{1,80}$')
    version: str = Field(max_length=80, pattern=r'^[a-zA-Z0-9_.-]+$')
    inputHash: str = Field(pattern=r'^[a-f0-9]{64}$')
    snapshotId: Optional[str] = Field(default=None, pattern=r'^source-[a-f0-9]{64}$')
    durationMs: int = Field(ge=0)
    error: Optional[Literal['tool_timeout', 'invalid_or_failed_tool']] = None


class RunTrace(StrictModel):
    rounds: int = Field(ge=0, le=4)
    tokens: int = Field(ge=0)
    modelVersion: Optional[str] = Field(default=None, max_length=100, pattern=r'^[a-zA-Z0-9_.-]+$')
    durationMs: int = Field(ge=0)
    error: Optional[Literal['template_configured', 'generation_failed', 'invalid_composition', 'model_unavailable']] = None
    tools: List[ToolTrace] = Field(max_length=8)
