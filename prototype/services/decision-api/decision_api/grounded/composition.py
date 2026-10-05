"""Finite model choices; all public facts are rendered by the server.

The controller supplies permitted actions/citations after deterministic evaluation.
This module does not accept user notes, free-form model prose, or model decisions.
"""
from copy import deepcopy
from typing import List, Literal
from pydantic import Field, model_validator
from ..models import StrictModel


PHRASES = {
    'review_evidence': '請依報告中的來源與限制確認補電安排。',
    'review_improvements': '可先改善報告列出的條件，再提交重新評估。',
    'discuss_with_advisor': '可分享這份報告，與顧問討論待確認項目。',
}


class Composition(StrictModel):
    actionCodes: List[str] = Field(max_length=8)
    citationIds: List[str] = Field(max_length=12)
    phraseCodes: List[Literal['review_evidence', 'review_improvements', 'discuss_with_advisor']] = Field(max_length=3)

    @model_validator(mode='after')
    def no_duplicates(self):
        for values in (self.actionCodes, self.citationIds, self.phraseCodes):
            if len(values) != len(set(values)):
                raise ValueError('Duplicate composition code')
        return self


def compose_verified(decision, candidate, *, allowed_actions, allowed_citations):
    """Return a copy of the complete decision plus an optional bounded explanation.

    allowed_citations must be the controller's role/model-authorized *seen* claims,
    never the full knowledge index. Omitting a model citation never removes a
    mandatory source, condition, or next action from the canonical decision.
    """
    original = deepcopy(decision)
    mode, error = 'template', 'model_unavailable'
    composition = None
    if candidate is not None:
        try:
            # Revalidate dictionaries even when the caller hands us a model instance.
            data = candidate.model_dump() if isinstance(candidate, Composition) else candidate
            parsed = Composition.model_validate(data)
            if not set(parsed.actionCodes).issubset(allowed_actions):
                raise ValueError('Unknown action')
            if not set(parsed.citationIds).issubset(allowed_citations):
                raise ValueError('Unknown citation')
            composition = {
                'actions': [deepcopy(allowed_actions[code]) for code in parsed.actionCodes],
                'citations': [deepcopy(allowed_citations[cid]) for cid in parsed.citationIds],
                'explanation': [PHRASES[code] for code in parsed.phraseCodes],
            }
            mode, error = 'llm', None
        except (ValueError, TypeError):
            error = 'invalid_composition'
    if composition is None:
        composition = {'actions': [], 'citations': [], 'explanation': [PHRASES['review_evidence']]}
    return {'decision': original, 'generationMode': mode,
            'composerVersion': 'grounded-composer-1', 'composition': composition,
            'generationError': error}
