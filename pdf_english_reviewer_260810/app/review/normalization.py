from __future__ import annotations

from typing import Any

from .evidence import enrich_issue_evidence


def normalize_issues(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [enrich_issue_evidence(issue) for issue in issues]
